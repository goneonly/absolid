import { describe, expect, it, vi } from 'vitest'
import {
  daysInRange, getRange, getPrevRange, mondayOf, rankRows, withRankDelta, weeklySummary,
} from './stats.js'

// 2026-10-15(목) 한국 시간 09:00
const THU = new Date(2026, 9, 15, 9)
const SUN = new Date(2026, 9, 18, 21)
const done = (...keys) => Object.fromEntries(keys.map(k => [k, { completed: true }]))

describe('기간 계산', () => {
  it('일수는 양 끝 포함, 서머타임 없는 한국 시간 기준', () => {
    expect(daysInRange('2026-10-01', '2026-10-31')).toBe(31)
    expect(daysInRange('2026-10-15', '2026-10-15')).toBe(1)
    expect(daysInRange('2026-12-30', '2027-01-02')).toBe(4)
  })
  it('주의 시작은 월요일 (일요일은 그 전 월요일)', () => {
    expect(mondayOf(THU)).toEqual(new Date(2026, 9, 12))
    expect(mondayOf(SUN)).toEqual(new Date(2026, 9, 12))
    expect(mondayOf(new Date(2026, 9, 12, 23))).toEqual(new Date(2026, 9, 12))
  })
  it.each([
    ['week', THU, ['2026-10-12', '2026-10-15']],
    ['week', SUN, ['2026-10-12', '2026-10-18']],
    ['month', THU, ['2026-10-01', '2026-10-15']],
    ['30d', THU, ['2026-09-16', '2026-10-15']],
  ])('%s', (period, today, want) => {
    expect(getRange(period, '', '', today)).toEqual(want)
  })
  it('직접 설정: 비우면 최근 7일, 앞뒤가 바뀌면 바로잡음', () => {
    expect(getRange('custom', '', '', THU)).toEqual(['2026-10-09', '2026-10-15'])
    expect(getRange('custom', '2026-10-10', '2026-10-01', THU)).toEqual(['2026-10-01', '2026-10-10'])
    expect(getRange('custom', '2026-10-03', '', THU)).toEqual(['2026-10-03', '2026-10-15'])
  })
  it('직전 기간은 같은 길이로 바로 앞', () => {
    expect(getPrevRange('2026-10-12', '2026-10-15')).toEqual(['2026-10-08', '2026-10-11'])
    expect(getPrevRange('2026-10-01', '2026-10-31')).toEqual(['2026-08-31', '2026-09-30'])
    expect(getPrevRange('2026-01-01', '2026-01-01')).toEqual(['2025-12-31', '2025-12-31'])
  })
})

describe('리더보드 순위', () => {
  const members = [
    { id: 'me', name: '나' },
    { id: 'b', name: '서연' },
    { id: 'c', name: '도윤' },
    { id: 'd', name: '하준' },
  ]
  const range = ['2026-10-12', '2026-10-15']

  it('인증 횟수 순, 동점은 같은 순위 (다음 순위는 건너뜀)', () => {
    const sets = { me: ['2026-10-12'], b: ['2026-10-12', '2026-10-13'], c: ['2026-10-12', '2026-10-14'] }
    const rows = rankRows(members, sets, 'me', null, ...range)
    expect(rows.map(r => [r.id, r.count, r.rank])).toEqual([
      ['c', 2, 1], ['b', 2, 1], ['me', 1, 3], ['d', 0, 4],
    ])
  })
  it('내 기록은 서버에 아직 없어도 로컬 기록으로 보충 (기간 안만, 중복 없이)', () => {
    const records = { ...done('2026-10-12', '2026-10-15', '2026-10-01'), '2026-10-14': { completed: false } }
    const rows = rankRows(members, { me: ['2026-10-12'] }, 'me', records, ...range)
    expect(rows.find(r => r.id === 'me').count).toBe(2)
  })
  it('다른 사람 기록은 로컬 기록으로 보충하지 않는다', () => {
    const rows = rankRows(members, {}, 'me', done('2026-10-13'), ...range)
    expect(rows.filter(r => r.count > 0).map(r => r.id)).toEqual(['me'])
  })
  it('순위 변동: 올라가면 양수, 새 멤버는 0', () => {
    const now = [{ id: 'a', rank: 1 }, { id: 'b', rank: 2 }, { id: 'new', rank: 3 }]
    const before = [{ id: 'b', rank: 1 }, { id: 'a', rank: 3 }]
    expect(withRankDelta(now, before).map(r => r.delta)).toEqual([2, -1, 0])
  })
})

describe('주간 리포트', () => {
  const at = (d) => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(d) }

  it('이번 주 인증·지난주 대비·달성률(지난 날 기준)', () => {
    at(THU) // 월~목 4일 경과
    const s = weeklySummary(done(
      '2026-10-12', '2026-10-13', '2026-10-15', // 이번 주 3회
      '2026-10-05', '2026-10-11', // 지난주 2회
      '2026-10-04', // 지지난주 — 제외
    ))
    expect(s).toMatchObject({ count: 3, lastCount: 2, delta: 1, rate: 75, streak: 1, range: '10.12 ~ 10.18' })
    expect(s.recent).toHaveLength(7)
    expect(s.recent.at(-1)).toMatchObject({ key: '2026-10-15', done: true })
  })
  it('월요일 아침 첫 운동 전: 달성률 0%, 0으로 나누지 않음', () => {
    at(new Date(2026, 9, 12, 7))
    expect(weeklySummary({})).toMatchObject({ count: 0, rate: 0, delta: 0 })
  })
  it('일요일 밤: 7일 모두 했으면 100%', () => {
    at(SUN)
    const week = Array.from({ length: 7 }, (_, i) => `2026-10-${12 + i}`)
    expect(weeklySummary(done(...week))).toMatchObject({ count: 7, rate: 100, streak: 7 })
  })
})
