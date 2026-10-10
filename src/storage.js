// 로컬(기기) 저장소 — localStorage 키는 이 파일에서만 정의하고, 바깥에는 용도별 함수만 노출
// (키 문자열이 여러 파일에 흩어지면 한쪽만 바뀌었을 때 오류 없이 기능이 꺼짐)
const KEY_PREFIX = 'absolid.'
const KEYS = {
  records: 'absolid.records.v1',
  profile: 'absolid.profile.v1',
  pendingProfile: 'absolid.pendingProfile.v1', // 이메일 인증 대기 중인 가입 정보
  serverCleanup: 'absolid.cleanup.v1',         // 서버 인증샷을 마지막으로 정리한 날짜
  remindDismissed: 'absolid.remind.dismissed', // 저녁 리마인더 배너를 닫은 날짜
  onboarding: 'absolid.onboarding.v1',         // 'pending' | 'done'
  pushConsent: 'absolid.pushconsent.v1',       // 푸시 동의 팝업을 이미 보여줬는지
  guest: 'absolid.guest.v1',                   // 첫 화면에서 '비회원으로 시작하기'를 골랐는지
}
const RECORDS_KEY = KEYS.records
const PROFILE_KEY = KEYS.profile

// 단순 값 읽기·쓰기 (프라이빗 모드 등에서 localStorage 접근이 실패해도 앱이 죽지 않게)
function read(key) {
  try { return localStorage.getItem(key) } catch { return null }
}
function write(key, value) {
  try { localStorage.setItem(key, value) } catch { /* noop */ }
}
function remove(key) {
  try { localStorage.removeItem(key) } catch { /* noop */ }
}

export function todayKey(d = new Date()) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

// 오늘 날짜의 "일" 기준 운동 Day 번호 (31일 → day 30)
export function todayWorkoutDay(d = new Date()) {
  return Math.min(d.getDate(), 30)
}

export function getRecords() {
  try { return JSON.parse(localStorage.getItem(RECORDS_KEY)) || {} } catch { return {} }
}

export function saveRecord(dateKey, rec) {
  const all = getRecords()
  all[dateKey] = { ...(all[dateKey] || {}), ...rec }
  localStorage.setItem(RECORDS_KEY, JSON.stringify(all))
  return all
}

export function clearRecords() {
  localStorage.removeItem(RECORDS_KEY)
}

// 로그아웃 시: 이 기기에 남은 계정별 데이터 정리
// (남겨두면 다른 계정으로 로그인할 때 이전 계정 기록이 새 계정으로 업로드됨)
const USER_SCOPED_KEYS = [KEYS.records, KEYS.profile, KEYS.serverCleanup, KEYS.remindDismissed]
export function clearLocalUserData() {
  for (const k of USER_SCOPED_KEYS) remove(k)
}

// 회원 탈퇴 시: 이 앱이 기기에 남긴 모든 값 삭제
export function clearAllAppData() {
  try {
    const keys = []
    for (let i = 0; i < localStorage.length; i++) keys.push(localStorage.key(i))
    for (const k of keys) if (k?.startsWith(KEY_PREFIX)) localStorage.removeItem(k)
  } catch { /* noop */ }
}

// ── 기기 플래그 ──────────────────────────────
// 비회원으로 시작하기 선택
export const isGuestChosen = () => read(KEYS.guest) === '1'
export const setGuestChosen = (on) => (on ? write(KEYS.guest, '1') : remove(KEYS.guest))

// 가입 직후 온보딩 팝업 (가입 요청 전에 pending → 팝업을 닫으면 done)
export const isOnboardingPending = () => read(KEYS.onboarding) === 'pending'
export const markOnboardingPending = () => write(KEYS.onboarding, 'pending')
export const markOnboardingDone = () => write(KEYS.onboarding, 'done')
export const cancelOnboarding = () => remove(KEYS.onboarding)

// 푸시 알림 동의 팝업 (기기당 1회)
export const isPushConsentAsked = () => !!read(KEYS.pushConsent)
export const markPushConsentAsked = () => write(KEYS.pushConsent, 'done')

// 서버 인증샷 정리 (하루 1회)
export const isServerCleanupDoneToday = () => read(KEYS.serverCleanup) === todayKey()
export const markServerCleanupDone = () => write(KEYS.serverCleanup, todayKey())

// 저녁 리마인더 배너 닫기 (하루 1회)
export const isReminderDismissedToday = () => read(KEYS.remindDismissed) === todayKey()
export const dismissReminderToday = () => write(KEYS.remindDismissed, todayKey())

// 이메일 인증 대기 중인 가입 정보 ({ email, profile })
export function loadPendingProfile() {
  try { return JSON.parse(read(KEYS.pendingProfile)) } catch { return null }
}
export const savePendingProfile = (value) => write(KEYS.pendingProfile, JSON.stringify(value))
export const clearPendingProfile = () => remove(KEYS.pendingProfile)

// 오래된 인증샷(dataURL)만 로컬에서 정리 — 완료 기록 자체는 유지
// localStorage 한도(약 5MB) 보호: 최근 keepDays일 사진만 남김
export function cleanupLocalPhotos(keepDays = 7) {
  const all = getRecords()
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - (keepDays - 1))
  const cutoffKey = todayKey(cutoff)
  let changed = false
  for (const k of Object.keys(all)) {
    if (k < cutoffKey && all[k]?.photo) {
      delete all[k].photo
      changed = true
    }
  }
  if (changed) localStorage.setItem(RECORDS_KEY, JSON.stringify(all))
}

export function computeStreak(records = getRecords()) {
  let streak = 0
  const d = new Date()
  // 오늘 안 했으면 어제부터 카운트 (streak는 아직 깨지지 않음)
  if (!records[todayKey(d)]?.completed) d.setDate(d.getDate() - 1)
  while (records[todayKey(d)]?.completed) {
    streak++
    d.setDate(d.getDate() - 1)
  }
  return streak
}

export function lastNDays(n, records = getRecords()) {
  const out = []
  const d = new Date()
  d.setDate(d.getDate() - (n - 1))
  for (let i = 0; i < n; i++) {
    const key = todayKey(d)
    out.push({ key, date: new Date(d), done: !!records[key]?.completed })
    d.setDate(d.getDate() + 1)
  }
  return out
}

export function getProfile() {
  try { return JSON.parse(localStorage.getItem(PROFILE_KEY)) || { nickname: '' } } catch { return { nickname: '' } }
}

export function saveProfile(p) {
  localStorage.setItem(PROFILE_KEY, JSON.stringify(p))
}

// 서버 기록을 로컬로 병합 (로컬에만 있는 사진 등은 유지)
export function mergeRecords(server) {
  if (!server) return
  const all = getRecords()
  for (const [k, v] of Object.entries(server)) {
    all[k] = { ...v, ...(all[k]?.photo ? { photo: all[k].photo } : {}) }
  }
  localStorage.setItem(RECORDS_KEY, JSON.stringify(all))
}
