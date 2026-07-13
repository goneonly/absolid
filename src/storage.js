// 로컬(기기) 저장소 — Day 2에서 Supabase로 확장 예정
const RECORDS_KEY = 'absolid.records.v1'
const PROFILE_KEY = 'absolid.profile.v1'

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
