import { describe, expect, it, vi } from 'vitest'
import {
  todayKey, todayWorkoutDay, getRecords, saveRecord, computeStreak, lastNDays, cleanupLocalPhotos,
  mergeRecords, clearLocalUserData, clearAllAppData, getProfile, saveProfile,
  isGuestChosen, setGuestChosen, isReminderDismissedToday, dismissReminderToday,
  isServerCleanupDoneToday, markServerCleanupDone, loadPendingProfile, savePendingProfile,
  isOnboardingPending, markOnboardingPending, markOnboardingDone, isPushConsentAsked, markPushConsentAsked,
} from './storage.js'

// 한국 시간 2026-10-15(목) 00:30 = UTC 10-14 15:30
const KST_AFTER_MIDNIGHT = new Date('2026-10-14T15:30:00Z')
// 한국 시간 2026-10-14(수) 23:50
const KST_BEFORE_MIDNIGHT = new Date('2026-10-14T14:50:00Z')

const at = (date) => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(date)
}
const done = (...keys) => Object.fromEntries(keys.map(k => [k, { completed: true }]))

describe('날짜 키 (한국 시간)', () => {
  it('UTC 가 아닌 기기 시간대로 날짜를 만든다 — 자정 직후', () => {
    expect(todayKey(KST_AFTER_MIDNIGHT)).toBe('2026-10-15')
  })
  it('자정 직전', () => {
    expect(todayKey(KST_BEFORE_MIDNIGHT)).toBe('2026-10-14')
  })
  it('인자가 없으면 현재 시각 기준', () => {
    at(KST_AFTER_MIDNIGHT)
    expect(todayKey()).toBe('2026-10-15')
  })
  it('Day 번호는 날짜의 "일", 31일은 30', () => {
    expect(todayWorkoutDay(new Date(2026, 9, 1))).toBe(1)
    expect(todayWorkoutDay(new Date(2026, 9, 30))).toBe(30)
    expect(todayWorkoutDay(new Date(2026, 9, 31))).toBe(30)
  })
})

describe('기록 저장', () => {
  it('같은 날짜에 저장하면 기존 값과 합친다', () => {
    saveRecord('2026-10-14', { completed: true, day: 14 })
    saveRecord('2026-10-14', { photo: 'data:x' })
    expect(getRecords()['2026-10-14']).toEqual({ completed: true, day: 14, photo: 'data:x' })
  })
  it('저장 값이 깨져 있으면 빈 기록으로 본다', () => {
    localStorage.setItem('absolid.records.v1', '{broken')
    expect(getRecords()).toEqual({})
  })
  it('서버 기록 병합 시 로컬에만 있는 사진은 유지한다', () => {
    saveRecord('2026-10-13', { completed: true, photo: 'data:local' })
    mergeRecords({
      '2026-10-13': { completed: true, day: 13, photoUrl: 'u/1.jpg' },
      '2026-10-14': { completed: true, day: 14 },
    })
    expect(getRecords()).toEqual({
      '2026-10-13': { completed: true, day: 13, photoUrl: 'u/1.jpg', photo: 'data:local' },
      '2026-10-14': { completed: true, day: 14 },
    })
  })
  it('mergeRecords(null) 은 아무것도 바꾸지 않는다', () => {
    saveRecord('2026-10-13', { completed: true })
    mergeRecords(null)
    expect(Object.keys(getRecords())).toEqual(['2026-10-13'])
  })
  it('오래된 로컬 사진만 지우고 완료 기록은 남긴다 (최근 7일 유지)', () => {
    at(KST_AFTER_MIDNIGHT) // 10-15 → 10-09 부터 유지
    saveRecord('2026-10-08', { completed: true, photo: 'old' })
    saveRecord('2026-10-09', { completed: true, photo: 'keep' })
    cleanupLocalPhotos()
    const r = getRecords()
    expect(r['2026-10-08']).toEqual({ completed: true })
    expect(r['2026-10-09'].photo).toBe('keep')
  })
})

describe('연속 기록(streak)', () => {
  it('오늘까지 이어진 연속 일수', () => {
    at(KST_AFTER_MIDNIGHT)
    expect(computeStreak(done('2026-10-13', '2026-10-14', '2026-10-15'))).toBe(3)
  })
  it('오늘 아직 안 했으면 어제까지로 센다 (아직 끊기지 않음)', () => {
    at(KST_AFTER_MIDNIGHT)
    expect(computeStreak(done('2026-10-13', '2026-10-14'))).toBe(2)
  })
  it('어제도 안 했으면 0', () => {
    at(KST_AFTER_MIDNIGHT)
    expect(computeStreak(done('2026-10-12', '2026-10-13'))).toBe(0)
  })
  it('중간에 빠진 날이 있으면 거기서 끊긴다', () => {
    at(KST_AFTER_MIDNIGHT)
    expect(computeStreak(done('2026-10-11', '2026-10-12', '2026-10-14', '2026-10-15'))).toBe(2)
  })
  it('자정 직전에 한 운동은 그날 기록으로 이어진다', () => {
    at(KST_BEFORE_MIDNIGHT)
    expect(computeStreak(done('2026-10-13', '2026-10-14'))).toBe(2)
  })
  it('월이 바뀌어도 이어진다', () => {
    at(new Date(2026, 10, 1, 9)) // 11-01
    expect(computeStreak(done('2026-10-30', '2026-10-31', '2026-11-01'))).toBe(3)
  })
  it('완료 표시가 없는 기록은 세지 않는다', () => {
    at(KST_AFTER_MIDNIGHT)
    expect(computeStreak({ '2026-10-15': { completed: false }, '2026-10-14': {} })).toBe(0)
  })
})

describe('최근 N일', () => {
  it('오래된 날부터 오늘까지 순서대로, 완료 여부 표시', () => {
    at(KST_AFTER_MIDNIGHT)
    const days = lastNDays(3, done('2026-10-14'))
    expect(days.map(d => [d.key, d.done])).toEqual([
      ['2026-10-13', false], ['2026-10-14', true], ['2026-10-15', false],
    ])
  })
})

describe('기기 플래그', () => {
  it('비회원 선택', () => {
    expect(isGuestChosen()).toBe(false)
    setGuestChosen(true)
    expect(isGuestChosen()).toBe(true)
    setGuestChosen(false)
    expect(isGuestChosen()).toBe(false)
  })
  it('온보딩: pending → done', () => {
    markOnboardingPending()
    expect(isOnboardingPending()).toBe(true)
    markOnboardingDone()
    expect(isOnboardingPending()).toBe(false)
  })
  it('푸시 동의 팝업은 한 번만', () => {
    expect(isPushConsentAsked()).toBe(false)
    markPushConsentAsked()
    expect(isPushConsentAsked()).toBe(true)
  })
  it('리마인더 닫기·서버 정리는 한국 시간 자정이 지나면 다시 필요해진다', () => {
    at(KST_BEFORE_MIDNIGHT)
    dismissReminderToday(); markServerCleanupDone()
    expect(isReminderDismissedToday()).toBe(true)
    expect(isServerCleanupDoneToday()).toBe(true)
    vi.setSystemTime(KST_AFTER_MIDNIGHT)
    expect(isReminderDismissedToday()).toBe(false)
    expect(isServerCleanupDoneToday()).toBe(false)
  })
  it('가입 대기 정보: 저장·읽기, 깨진 값은 null', () => {
    savePendingProfile({ email: 'a@b.co', profile: { nickname: '민준' } })
    expect(loadPendingProfile()).toEqual({ email: 'a@b.co', profile: { nickname: '민준' } })
    localStorage.setItem('absolid.pendingProfile.v1', '{x')
    expect(loadPendingProfile()).toBeNull()
  })
  it('localStorage 접근이 막혀도(프라이빗 모드 등) 오류 없이 기본값', () => {
    vi.stubGlobal('localStorage', {
      getItem() { throw new Error('denied') }, setItem() { throw new Error('denied') },
      removeItem() { throw new Error('denied') }, get length() { throw new Error('denied') },
    })
    expect(isGuestChosen()).toBe(false)
    expect(() => setGuestChosen(true)).not.toThrow()
    expect(() => clearLocalUserData()).not.toThrow()
    expect(() => clearAllAppData()).not.toThrow()
    expect(getRecords()).toEqual({})
    expect(getProfile()).toEqual({ nickname: '' })
  })
})

describe('기기 데이터 정리', () => {
  const seed = () => {
    saveRecord('2026-10-14', { completed: true })
    saveProfile({ nickname: '민준' })
    markServerCleanupDone(); dismissReminderToday()
    setGuestChosen(true); markPushConsentAsked(); markOnboardingDone()
    localStorage.setItem('other.app', 'keep')
  }
  it('로그아웃: 계정별 데이터만 지우고 기기 설정은 유지', () => {
    seed()
    clearLocalUserData()
    expect(getRecords()).toEqual({})
    expect(getProfile()).toEqual({ nickname: '' })
    expect(isServerCleanupDoneToday()).toBe(false)
    expect(isReminderDismissedToday()).toBe(false)
    expect(isGuestChosen()).toBe(true)
    expect(isPushConsentAsked()).toBe(true)
  })
  it('회원 탈퇴: 이 앱의 값(absolid.*)은 모두 지우고 다른 값은 건드리지 않는다', () => {
    seed()
    clearAllAppData()
    const left = Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i))
    expect(left).toEqual(['other.app'])
  })
})
