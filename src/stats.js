// 기록 통계 계산 — 리더보드 순위·기간, 주간 리포트 요약 (화면과 분리한 순수 함수)
import { todayKey, computeStreak, lastNDays } from './storage.js'

// 'YYYY-MM-DD' → 그 날짜 자정(기기 시간대)
export function parseKey(key) {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, m - 1, d)
}

// 날짜 키 범위의 일수 (양 끝 포함)
export function daysInRange(startKey, endKey) {
  return Math.round((parseKey(endKey) - parseKey(startKey)) / 86400000) + 1
}

// 그 주의 월요일 자정
export function mondayOf(d) {
  const x = new Date(d)
  const day = x.getDay() // 0=일 … 6=토
  x.setDate(x.getDate() - (day === 0 ? 6 : day - 1))
  x.setHours(0, 0, 0, 0)
  return x
}

// start 부터 n일의 날짜 키
export function keysFrom(start, n) {
  const out = []
  const d = new Date(start)
  for (let i = 0; i < n; i++) {
    out.push(todayKey(d))
    d.setDate(d.getDate() + 1)
  }
  return out
}

// ── 리더보드 ─────────────────────────────────
// 기간 → [시작키, 끝키] (week: 이번 주 월요일~오늘, month: 1일~오늘, 30d: 최근 30일, custom: 직접 설정)
export function getRange(period, customStart, customEnd, today = new Date()) {
  const end = todayKey(today)
  const s = new Date(today)
  if (period === 'week') {
    s.setDate(s.getDate() - (s.getDay() === 0 ? 6 : s.getDay() - 1))
  } else if (period === 'month') {
    s.setDate(1)
  } else if (period === '30d') {
    s.setDate(s.getDate() - 29)
  } else if (period === 'custom') {
    const defStart = new Date(today); defStart.setDate(defStart.getDate() - 6)
    let a = customStart || todayKey(defStart)
    let b = customEnd || end
    if (a > b) [a, b] = [b, a]
    return [a, b]
  }
  return [todayKey(s), end]
}

// 직전 동일 길이 기간 (순위 변동 비교용)
export function getPrevRange(startKey, endKey) {
  const days = daysInRange(startKey, endKey)
  const pe = parseKey(startKey); pe.setDate(pe.getDate() - 1)
  const ps = new Date(pe); ps.setDate(ps.getDate() - (days - 1))
  return [todayKey(ps), todayKey(pe)]
}

// 인증 횟수 → 순위 (동점은 같은 순위, 같은 횟수면 이름순)
// dateSets: { memberId: ['YYYY-MM-DD', …] } / 내 기록은 로컬 기록으로 보충 (서버 동기화 지연 대비)
export function rankRows(members, dateSets, myId, records, startKey, endKey) {
  const rows = members.map(m => {
    const set = new Set(dateSets[m.id] || [])
    if (m.id === myId && records) {
      for (const [k, v] of Object.entries(records)) {
        if (v?.completed && k >= startKey && k <= endKey) set.add(k)
      }
    }
    return { ...m, count: set.size }
  })
  rows.sort((a, b) => b.count - a.count || String(a.name ?? '').localeCompare(String(b.name ?? '')))
  let rank = 0; let prevCount = null
  rows.forEach((r, i) => {
    if (r.count !== prevCount) { rank = i + 1; prevCount = r.count }
    r.rank = rank
  })
  return rows
}

// 현재 순위에 직전 기간 대비 변동(delta: 양수 = 올라감) 추가
export function withRankDelta(current, before) {
  const prevRank = Object.fromEntries(before.map(r => [r.id, r.rank]))
  return current.map(r => ({ ...r, delta: (prevRank[r.id] ?? r.rank) - r.rank }))
}

// ── 주간 리포트 ──────────────────────────────
// 이번 주(월~일) 인증 수, 지난주 대비, 달성률(지난 날 기준), 연속 기록, 최근 7일
export function weeklySummary(records, now = new Date()) {
  const monday = mondayOf(now)
  const lastMonday = new Date(monday)
  lastMonday.setDate(lastMonday.getDate() - 7)
  const today = todayKey(now)

  const weekKeys = keysFrom(monday, 7)
  const lastWeekKeys = keysFrom(lastMonday, 7)
  const done = (k) => !!records[k]?.completed

  const count = weekKeys.filter(done).length
  const lastCount = lastWeekKeys.filter(done).length
  const elapsed = Math.max(1, weekKeys.filter((k) => k <= today).length)

  return {
    count,
    lastCount,
    delta: count - lastCount,
    rate: Math.round((count / elapsed) * 100),
    streak: computeStreak(records),
    recent: lastNDays(7, records),
    range: `${weekKeys[0].slice(5).replace('-', '.')} ~ ${weekKeys[6].slice(5).replace('-', '.')}`,
  }
}
