import { useEffect, useMemo, useState } from 'react'
import { todayKey } from '../storage.js'
import { fetchGroupWorkoutDates } from '../api.js'
import { Card, CardTitle, Input, MemberAvatar, Sub, cx } from './ui.jsx'

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
    <Card>
      <div className="flex items-center justify-between">
        <CardTitle>리더보드 🏆</CardTitle>
        <span className="text-2xs text-dim">
          {startKey.slice(5).replace('-', '.')} ~ {endKey.slice(5).replace('-', '.')}
        </span>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {PERIODS.map(p => (
          <button
            key={p.key}
            className={cx(
              'rounded-full border px-3 py-1.5 text-xs font-semibold',
              period === p.key ? 'border-brand/40 bg-brand/15 text-brand' : 'border-line bg-surface-2 text-dim',
            )}
            onClick={() => setPeriod(p.key)}
          >
            {p.label}
          </button>
        ))}
      </div>

      {period === 'custom' && (
        <div className="mt-2.5 flex items-center gap-2">
          <Input type="date" className="flex-1 px-2.5 py-2 text-sm" value={cs} max={todayKey()}
            onChange={e => setCs(e.target.value)} aria-label="시작 날짜" />
          <Sub>~</Sub>
          <Input type="date" className="flex-1 px-2.5 py-2 text-sm" value={ce} max={todayKey()}
            onChange={e => setCe(e.target.value)} aria-label="끝 날짜" />
        </div>
      )}

      {!rows || (loading && !cur) ? (
        <Sub className="mt-3">집계 중…</Sub>
      ) : (
        <>
          {me && (
            <div className="mt-3 rounded-md border border-brand/30 bg-brand/12 px-3.5 py-2.5 text-sm">
              내 순위 <strong className="text-md text-brand">{me.rank}위</strong> · 인증 {me.count}회
              {me.delta !== 0 && (
                <span className={cx('ml-1.5 text-2xs font-bold', me.delta > 0 ? 'text-success' : 'text-dim')}>
                  {me.delta > 0 ? `▲${me.delta}` : `▼${-me.delta}`}
                </span>
              )}
            </div>
          )}

          <div className="mt-1">
            {rows.map(r => {
              const medal = r.rank <= 3 && r.count > 0
              return (
                <div key={r.id} className="flex items-center gap-2.5 border-b border-line py-3 last:border-b-0">
                  <span className={cx('w-6.5 flex-none text-center font-extrabold text-dim', medal ? 'text-lg' : 'text-sm')}>
                    {medal ? MEDALS[r.rank - 1] : r.rank}
                  </span>
                  <MemberAvatar name={r.name} avatar={r.avatar} active={r.rank === 1 && r.count > 0} />
                  <div className="min-w-0 flex-1">
                    <span className={cx('text-base font-semibold', r.id === myId && 'text-brand')}>
                      {r.id === myId ? (myName || r.name) : r.name}
                      {r.id === myId ? ' (나)' : ''}
                    </span>
                    <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-surface-2">
                      <i className="block h-full rounded-full bg-brand transition-[width] duration-300" style={{ width: `${Math.min(100, (r.count / totalDays) * 100)}%` }} />
                    </div>
                  </div>
                  <span className={cx('w-7.5 flex-none text-right text-2xs font-bold', r.delta > 0 ? 'text-success' : r.delta < 0 ? 'text-dim' : 'text-dot')}>
                    {r.delta > 0 ? `▲${r.delta}` : r.delta < 0 ? `▼${-r.delta}` : '—'}
                  </span>
                  <span className="w-10 flex-none text-right text-base font-extrabold">
                    {r.count}<span className="ml-px text-2xs font-normal text-dim">회</span>
                  </span>
                </div>
              )
            })}
          </div>

          <Sub className="mt-2.5 text-2xs">
            기간 내 인증 횟수 기준 · ▲▼는 직전 {totalDays}일 대비 순위 변동
          </Sub>
        </>
      )}
    </Card>
  )
}
