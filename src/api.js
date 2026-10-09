// 서버 기록 동기화 — 로그인 상태일 때만 동작, 아니면 조용히 패스
import { supabase } from './supabase.js'
import { getRecords, todayKey } from './storage.js'

async function uid() {
  if (!supabase) return null
  const { data } = await supabase.auth.getSession()
  return data.session?.user?.id || null
}

// ── 인증샷 signed URL 헬퍼 ───────────────────
// photos 버킷은 비공개라 조회 시 짧은 유효기간의 signed URL 을 발급받아야 함.
// DB에는 스토리지 경로(`uid/date.jpg`)를 저장하되, 과거 public URL 로 저장된 값도 경로를 추출해 호환.
const PHOTO_TTL = 60 * 60 * 8 // 8시간

export function photoObjectPath(value) {
  if (!value) return null
  const marker = '/photos/'
  const i = value.indexOf(marker)
  return i >= 0 ? value.slice(i + marker.length) : value // 이미 경로면 그대로
}

// 여러 경로를 한 번에 서명 → { path: signedUrl } 매핑 반환
async function signPhotoPaths(paths) {
  const clean = [...new Set(paths.filter(Boolean).map(photoObjectPath))]
  if (!clean.length) return {}
  try {
    const { data } = await supabase.storage.from('photos').createSignedUrls(clean, PHOTO_TTL)
    const out = {}
    for (const item of data || []) {
      if (item?.path && item?.signedUrl) out[item.path] = item.signedUrl
    }
    return out
  } catch {
    return {}
  }
}

export async function pushRecord(dateKey, day, completedAt) {
  const user_id = await uid()
  if (!user_id) return
  // supabase-js 는 실패해도 throw 하지 않고 { error } 를 반환 → 직접 던져서 호출부가 안내하게 함
  const { error } = await supabase.from('workouts').upsert(
    { user_id, date: dateKey, day, completed_at: completedAt || new Date().toISOString() },
    { onConflict: 'user_id,date' }
  )
  if (error) throw new Error(error.message)
}

export async function fetchServerRecords() {
  const user_id = await uid()
  if (!user_id) return null
  const { data, error } = await supabase
    .from('workouts')
    .select('date, day, completed_at, photo_url')
    .eq('user_id', user_id)
  if (error || !data) return null
  const out = {}
  for (const r of data) {
    out[r.date] = { completed: true, day: r.day, completedAt: r.completed_at }
    if (r.photo_url) out[r.date].photoUrl = r.photo_url
  }
  return out
}

// ── 사진 업로드 (Day 5) ─────────────────────
// 인증샷(dataURL)을 Storage에 올리고 기록에 photo_url 연결
export async function uploadPhoto(dateKey, dataUrl) {
  const user_id = await uid()
  if (!user_id || !dataUrl) return null
  try {
    const blob = await (await fetch(dataUrl)).blob()
    const path = `${user_id}/${dateKey}.jpg`
    const { error } = await supabase.storage
      .from('photos')
      .upload(path, blob, { upsert: true, contentType: 'image/jpeg' })
    if (error) return null
    // 비공개 버킷: DB에는 경로를 저장하고, 즉시 표시용 signed URL 을 반환
    const { error: linkErr } = await supabase.from('workouts')
      .update({ photo_url: path })
      .eq('user_id', user_id).eq('date', dateKey)
    if (linkErr) return null
    const { data } = await supabase.storage.from('photos').createSignedUrl(path, PHOTO_TTL)
    return data?.signedUrl || path
  } catch { return null }
}

// ── 서버 인증샷 정리 ─────────────────────────
// 30일 지난 내 인증샷을 Storage에서 삭제하고 photo_url을 비움
// (RLS상 본인 파일만 지울 수 있어 각자 접속 시 자기 몫을 정리하는 방식)
export async function cleanupOldServerPhotos(keepDays = 30) {
  const user_id = await uid()
  if (!user_id) return
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - keepDays)
  const cutoffKey = todayKey(cutoff)
  try {
    const { data: files } = await supabase.storage.from('photos').list(user_id, { limit: 1000 })
    const old = (files || [])
      .filter(f => f.name.replace('.jpg', '') < cutoffKey)
      .map(f => `${user_id}/${f.name}`)
    if (old.length) await supabase.storage.from('photos').remove(old)
    await supabase.from('workouts')
      .update({ photo_url: null })
      .eq('user_id', user_id).lt('date', cutoffKey).not('photo_url', 'is', null)
  } catch { /* noop */ }
}

// ── 프로필 사진 ─────────────────────────────
// 프로필 사진(dataURL)을 Storage에 올리고 profiles.avatar_url에 연결
export async function uploadAvatar(dataUrl) {
  const user_id = await uid()
  if (!user_id || !dataUrl) return null
  try {
    const blob = await (await fetch(dataUrl)).blob()
    const path = `${user_id}/avatar.jpg`
    const { error } = await supabase.storage
      .from('avatars')
      .upload(path, blob, { upsert: true, contentType: 'image/jpeg' })
    if (error) return null
    const { data } = supabase.storage.from('avatars').getPublicUrl(path)
    const avatar_url = data?.publicUrl ? `${data.publicUrl}?t=${Date.now()}` : null
    if (avatar_url) await supabase.from('profiles').upsert({ id: user_id, avatar_url })
    return avatar_url
  } catch { return null }
}

export async function deleteAvatar() {
  const user_id = await uid()
  if (!user_id) return
  try {
    await supabase.storage.from('avatars').remove([`${user_id}/avatar.jpg`])
    await supabase.from('profiles').upsert({ id: user_id, avatar_url: null })
  } catch { /* noop */ }
}

// ── 그룹 (Day 3~4) ──────────────────────────

// 닉네임을 서버 프로필에 반영 (그룹에서 이름이 보이도록)
export async function pushProfile(nickname) {
  const user_id = await uid()
  if (!user_id) return
  await supabase.from('profiles').upsert({ id: user_id, nickname: nickname || '' })
}

// 내가 속한 그룹 목록 (참여 순서 무관, 생성일 오래된 순) + 멤버 수
export async function fetchMyGroups() {
  const user_id = await uid()
  if (!user_id) return []
  const { data: mem, error: memErr } = await supabase
    .from('group_members').select('group_id').eq('user_id', user_id)
  if (memErr) throw new Error('그룹 목록을 불러오지 못했어요.')
  if (!mem?.length) return []
  const { data, error } = await supabase
    .from('groups')
    .select('id, name, invite_code, max_members, members_only, created_by, photo_url, created_at, group_members(count)')
    .in('id', mem.map(m => m.group_id))
    .order('created_at')
  if (error) throw new Error('그룹 목록을 불러오지 못했어요.')
  return (data || []).map(g => ({ ...g, memberCount: g.group_members?.[0]?.count ?? 0 }))
}

// 그룹 생성 — 그룹·내 멤버십·초대 코드를 서버 함수에서 한 번에 처리 (v0.5-groups-and-fixes.sql)
export async function createGroup(name, nickname, options = {}) {
  const user_id = await uid()
  if (!user_id) throw new Error('로그인이 필요해요.')
  await pushProfile(nickname)
  const { data, error } = await supabase.rpc('create_group', {
    p_name: name,
    p_max_members: Number(options.maxMembers),
    p_members_only: !!options.membersOnly,
  })
  if (error) throw new Error(error.message || '그룹 생성에 실패했어요. 잠시 후 다시 시도해 주세요.')
  const g = Array.isArray(data) ? data[0] : data
  if (!g) throw new Error('그룹 생성에 실패했어요. 다시 시도해 주세요.')
  return g
}

export async function joinGroup(code, nickname) {
  const user_id = await uid()
  if (!user_id) throw new Error('로그인이 필요해요.')
  const clean = (code || '').trim().toUpperCase()
  if (clean.length !== 6) throw new Error('초대 코드는 6자리예요.')

  // 닉네임을 먼저 반영한 뒤, 정원·회원제한·중복참여를 서버에서 원자적으로 처리
  await pushProfile(nickname)
  const { data, error } = await supabase.rpc('join_group', { code: clean })
  if (error) throw new Error(error.message || '참여에 실패했어요. 잠시 후 다시 시도해 주세요.')
  const g = Array.isArray(data) ? data[0] : data
  if (!g) throw new Error('초대 코드를 찾을 수 없어요. 다시 확인해 주세요.')
  return g
}

// 그룹 나가기 — 그룹장이면 서버에서 자동 위임, 마지막 멤버면 그룹 삭제
export async function leaveGroup(group) {
  // 마지막 멤버(=그룹장)가 나가면 그룹이 사라지므로 그룹 사진을 먼저 정리 (그룹장만 삭제 가능)
  if (group.memberCount <= 1 && group.photo_url) {
    await supabase.storage.from('group-photos').remove([`${group.id}/photo.jpg`]).catch(() => {})
  }
  const { error } = await supabase.rpc('leave_group', { p_gid: group.id })
  if (error) throw new Error('그룹 나가기에 실패했어요. 잠시 후 다시 시도해 주세요.')
}

// ── 그룹 사진 (그룹장 전용) ─────────────────
export async function uploadGroupPhoto(groupId, dataUrl) {
  const blob = await (await fetch(dataUrl)).blob()
  const path = `${groupId}/photo.jpg`
  const { error } = await supabase.storage
    .from('group-photos')
    .upload(path, blob, { upsert: true, contentType: 'image/jpeg' })
  if (error) throw new Error('그룹 사진 업로드에 실패했어요.')
  const { data } = supabase.storage.from('group-photos').getPublicUrl(path)
  const url = `${data.publicUrl}?t=${Date.now()}`
  const { error: setErr } = await supabase.rpc('set_group_photo', { p_gid: groupId, p_url: url })
  if (setErr) throw new Error(setErr.message || '그룹 사진 저장에 실패했어요.')
  return url
}

export async function removeGroupPhoto(groupId) {
  const { error } = await supabase.rpc('set_group_photo', { p_gid: groupId, p_url: null })
  if (error) throw new Error(error.message || '그룹 사진 삭제에 실패했어요.')
  await supabase.storage.from('group-photos').remove([`${groupId}/photo.jpg`]).catch(() => {})
}

// 그룹 멤버 + 최근 7일 운동현황 + 오늘의 인증샷
export async function fetchGroupStatus(groupId) {
  const { data: mem } = await supabase
    .from('group_members').select('user_id').eq('group_id', groupId)
  const ids = (mem || []).map(m => m.user_id)
  if (!ids.length) return { members: [], photos: [] }
  // 기록 날짜는 기기 로컬(한국) 날짜로 저장되므로 같은 기준으로 계산 (toISOString 은 UTC라 0~9시에 하루 밀림)
  const since = new Date(); since.setDate(since.getDate() - 6)
  const sinceKey = todayKey(since)
  const todayStr = todayKey()
  const [{ data: profs }, { data: works }] = await Promise.all([
    supabase.rpc('get_group_profiles', { gid: groupId }),
    supabase.from('workouts').select('user_id, date, photo_url').in('user_id', ids).gte('date', sinceKey),
  ])
  const names = Object.fromEntries((profs || []).map(p => [p.id, p.nickname]))
  const avatars = Object.fromEntries((profs || []).map(p => [p.id, p.avatar_url || '']))
  const doneDates = {}
  const todayPhotoRows = []
  for (const w of works || []) {
    (doneDates[w.user_id] ||= new Set()).add(w.date)
    if (w.date === todayStr && w.photo_url) todayPhotoRows.push(w)
  }
  // 비공개 버킷: 오늘 인증샷 경로를 한 번에 서명
  const signed = await signPhotoPaths(todayPhotoRows.map(w => w.photo_url))
  const photos = todayPhotoRows
    .map(w => ({
      id: w.user_id,
      name: names[w.user_id] || '이름 없음',
      url: signed[photoObjectPath(w.photo_url)] || null,
    }))
    .filter(p => p.url)
  const members = ids.map(id => ({
    id,
    name: names[id] || '이름 없음',
    avatar: avatars[id] || '',
    dates: doneDates[id] || new Set(),
  }))
  return { members, photos }
}

// ── 그룹 리더보드 ────────────────────────────
// 기간 내 멤버별 인증 완료 날짜 집계 (RLS: 같은 그룹 멤버끼리 조회 가능)
export async function fetchGroupWorkoutDates(memberIds, startKey, endKey) {
  if (!memberIds?.length) return {}
  const { data } = await supabase
    .from('workouts')
    .select('user_id, date')
    .in('user_id', memberIds)
    .gte('date', startKey)
    .lte('date', endKey)
  const out = {}
  for (const w of data || []) (out[w.user_id] ||= new Set()).add(w.date)
  return out
}

// ── 운동 기록 전체 초기화 ────────────────────
// 서버의 내 운동 기록(workouts)과 인증샷(Storage)을 모두 삭제
// 반환: true = 성공, false = 서버 기록이 남아 있음 (삭제 정책 미설정 등)
export async function resetServerWorkouts() {
  const user_id = await uid()
  if (!user_id) return true // 비회원: 서버 데이터 없음
  try {
    const { data: files } = await supabase.storage.from('photos').list(user_id, { limit: 1000 })
    if (files?.length) {
      await supabase.storage.from('photos').remove(files.map(f => `${user_id}/${f.name}`))
    }
  } catch { /* 사진 삭제 실패는 기록 삭제를 막지 않음 */ }
  const { error } = await supabase.from('workouts').delete().eq('user_id', user_id)
  if (error) return false
  // RLS에 삭제 정책이 없으면 오류 없이 0건 삭제됨 — 실제로 비워졌는지 확인
  const { count } = await supabase
    .from('workouts')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', user_id)
  return !count
}

// 비회원 시절 로컬 기록을 서버로 올리기 (로그인 직후 1회)
export async function syncLocalToServer() {
  const user_id = await uid()
  if (!user_id) return
  const rows = Object.entries(getRecords())
    .filter(([, v]) => v.completed)
    .map(([date, v]) => ({
      user_id, date, day: v.day || 1,
      completed_at: v.completedAt || new Date().toISOString(),
    }))
  if (rows.length) await supabase.from('workouts').upsert(rows, { onConflict: 'user_id,date' })
}
