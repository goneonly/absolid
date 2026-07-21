import { useEffect, useMemo, useState } from 'react'
import { todayKey } from '../storage.js'
import { fetchGroupWorkoutDates } from '../api.js'

const PERIODS = [
  { key: 'week', label: '이번 주' },
  { key: 'month', label: '이번 달' },
  { key: '30d', label: '최근 30일' },
  { key: 'custom', label: '직접 설정' },
]

const MEDALS = ['🥇', '🥈', '🥉']

function parseKey(key) {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, m - 1, d)
}

// 기간 → [시작키, 끝키]
function getRange(period, cs, ce) {
  const today = new Date()
  const end = todayKey(today)
  const s = new Date(today)
  if (period === 'week') {
    const day = s.getDay() === 0 ? 6 : s.getDay() - 1 // 월요일 시작
    s.setDate(s.getDate() - day)
  } else if (period === 'month') {
    s.setDate(1)
  } else if (period === '30d') {
    s.setDate(s.getDate() - 29)
  } else if (period === 'custom') {
    const defStart = new Date(today); defStart.setDate(defStart.getDate() - 6)
    let a = cs || todayKey(defStart)
    let b = ce || end
    if (a > b) [a, b] = [b, a]
    return [a, b]
  }
  return [todayKey(s), end]
}

// 직전 동일 길이 기간 (순위 변동 비교용)
function getPrevRange(startKey, endKey) {
  const s = parseKey(startKey)
  const e = parseKey(endKey)
  const days = Math.round((e - s) / 86400000) + 1
  const pe = new Date(s); pe.setDate(pe.getDate() - 1)
  const ps = new Date(pe); ps.setDate(ps.getDate() - (days - 1))
  return [todayKey(ps), todayKey(pe)]
}

function daysInRange(startKey, endKey) {
  return Math.round((parseKey(endKey) - parseKey(startKey)) / 86400000) + 1
}

// 인증 횟수 → 순위 (동점은 같은 순위)
function rankRows(members, dateSets, myId, records, startKey, endKey) {
  const rows = members.map(m => {
    const set = new Set(dateSets[m.id] || [])
    // 내 기록은 로컬 기록으로 보충 (서버 동기화 지연 대비)
    if (m.id === myId && records) {
      for (const [k, v] of Object.entries(records)) {
        if (v?.completed && k >= startKey && k <= endKey) set.add(k)
      }
    }
    return { ...m, count: set.size }
  })
  rows.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
  let rank = 0; let prevCount = null
  rows.forEach((r, i) => {
    if (r.count !== prevCount) { rank = i + 1; prevCount = r.count }
    r.rank = rank
  })
  return rows
}

function Avatar({ name, avatar, top }) {
  return (
    <span className={'member-avatar' + (top ? ' done' : '')}>
      {avatar ? (
        <img src={avatar} alt={`${name} 프로필 사진`} loading="lazy" />
      ) : (
        <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M12 12a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9Zm0 2c-4.2 0-8 2.2-8 5.4V21h16v-1.6c0-3.2-3.8-5.4-8-5.4Z" />
        </svg>
      )}
    </span>
  )
}

export default function Leaderboard({ members, myId, myName, records }) {
  const [period, setPeriod] = useState('week')
  const [cs, setCs] = useState('')
  const [ce, setCe] = useState('')
  const [cur, setCur] = useState(null)
  const [prev, setPrev] = useState(null)
  const [loading, setLoading] = useState(false)

  const [startKey, endKey] = useMemo(() => getRange(period, cs, ce), [period, cs, ce])
  const [pStartKey, pEndKey] = useMemo(() => getPrevRange(startKey, endKey), [startKey, endKey])

  useEffect(() => {
    let alive = true
    async function run() {
      if (!members.length) return
      setLoading(true)
      const ids = members.map(m => m.id)
      try {
        const [c, p] = await Promise.all([
          fetchGroupWorkoutDates(ids, startKey, endKey),
          fetchGroupWorkoutDates(ids, pStartKey, pEndKey),
        ])
        if (alive) { setCur(c); setPrev(p) }
      } catch { /* 네트워크 오류 시 조용히 패스 */ }
      if (alive) setLoading(false)
    }
    run()
    return () => { alive = false }
  }, [members, myId, startKey, endKey, pStartKey, pEndKey])

  const rows = useMemo(() => {
    if (!cur) return null
    const current = rankRows(members, cur, myId, records, startKey, endKey)
    const before = rankRows(members, prev || {}, myId, records, pStartKey, pEndKey)
    const prevRank = Object.fromEntries(before.map(r => [r.id, r.rank]))
    return current.map(r => ({ ...r, delta: (prevRank[r.id] ?? r.rank) - r.rank }))
  }, [cur, prev, members, myId, records, startKey, endKey, pStartKey, pEndKey])

  const totalDays = daysInRange(startKey, endKey)
  const me = rows?.find(r => r.id === myId)

  return (
    <section className="card">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontWeight: 700, fontSize: 15 }}>리더보드 🏆</div>
        <span className="sub" style={{ fontSize: 11 }}>
          {startKey.slice(5).replace('-', '.')} ~ {endKey.slice(5).replace('-', '.')}
        </span>
      </div>

      <div className="lb-tabs">
        {PERIODS.map(p => (
          <button
            key={p.key}
            className={'lb-tab' + (period === p.key ? ' on' : '')}
            onClick={() => setPeriod(p.key)}
          >
            {p.label}
          </button>
        ))}
      </div>

      {period === 'custom' && (
        <div className="lb-custom">
          <input type="date" className="input" value={cs} max={todayKey()}
            onChange={e => setCs(e.target.value)} aria-label="시작 날짜" />
          <span className="sub">~</span>
          <input type="date" className="input" value={ce} max={todayKey()}
            onChange={e => setCe(e.target.value)} aria-label="끝 날짜" />
        </div>
      )}

      {!rows || (loading && !cur) ? (
        <p className="sub" style={{ marginTop: 12 }}>집계 중…</p>
      ) : (
        <>
          {me && (
            <div className="lb-me">
              내 순위 <strong>{me.rank}위</strong> · 인증 {me.count}회
              {me.delta !== 0 && (
                <span className={'lb-delta ' + (me.delta > 0 ? 'up' : 'down')} style={{ marginLeft: 6 }}>
                  {me.delta > 0 ? `▲${me.delta}` : `▼${-me.delta}`}
                </span>
              )}
            </div>
          )}

          <div style={{ marginTop: 4 }}>
            {rows.map(r => (
              <div key={r.id} className={'lb-row' + (r.id === myId ? ' me' : '')}>
                <span className={'lb-rank' + (r.rank <= 3 && r.count > 0 ? ' medal' : '')}>
                  {r.rank <= 3 && r.count > 0 ? MEDALS[r.rank - 1] : r.rank}
                </span>
                <Avatar name={r.name} avatar={r.avatar} top={r.rank === 1 && r.count > 0} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <span className="name" style={{ fontSize: 14 }}>
                    {r.id === myId ? (myName || r.name) : r.name}
                    {r.id === myId ? ' (나)' : ''}
                  </span>
                  <div className="lb-bar">
                    <i style={{ width: `${Math.min(100, (r.count / totalDays) * 100)}%` }} />
                  </div>
                </div>
                <span className={'lb-delta ' + (r.delta > 0 ? 'up' : r.delta < 0 ? 'down' : '')}>
                  {r.delta > 0 ? `▲${r.delta}` : r.delta < 0 ? `▼${-r.delta}` : '—'}
                </span>
                <span className="lb-count">
                  {r.count}<span>회</span>
                </span>
              </div>
            ))}
          </div>

          <p className="sub" style={{ fontSize: 11, marginTop: 10 }}>
            기간 내 인증 횟수 기준 · ▲▼는 직전 {totalDays}일 대비 순위 변동
          </p>
        </>
      )}
    </section>
  )
}
