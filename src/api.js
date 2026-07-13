// 서버 기록 동기화 — 로그인 상태일 때만 동작, 아니면 조용히 패스
import { supabase } from './supabase.js'
import { getRecords } from './storage.js'

async function uid() {
  if (!supabase) return null
  const { data } = await supabase.auth.getSession()
  return data.session?.user?.id || null
}

export async function pushRecord(dateKey, day, completedAt) {
  const user_id = await uid()
  if (!user_id) return
  await supabase.from('workouts').upsert(
    { user_id, date: dateKey, day, completed_at: completedAt || new Date().toISOString() },
    { onConflict: 'user_id,date' }
  )
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
    const { data } = supabase.storage.from('photos').getPublicUrl(path)
    const photo_url = data?.publicUrl || null
    if (photo_url) {
      await supabase.from('workouts')
        .update({ photo_url })
        .eq('user_id', user_id).eq('date', dateKey)
    }
    return photo_url
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
  const cutoffKey = cutoff.toISOString().slice(0, 10)
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

function makeInviteCode() {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789' // 헷갈리는 문자(I,L,O,0,1) 제외
  let out = ''
  for (let i = 0; i < 6; i++) out += chars[Math.floor(Math.random() * chars.length)]
  return out
}

// 내가 속한 그룹 조회 (없으면 null)
export async function fetchMyGroup() {
  const user_id = await uid()
  if (!user_id) return null
  const { data: mem } = await supabase
    .from('group_members').select('group_id').eq('user_id', user_id).limit(1)
  if (!mem?.length) return null
  const { data: g } = await supabase
    .from('groups').select('id, name, invite_code, max_members').eq('id', mem[0].group_id).single()
  return g || null
}

export async function createGroup(name, nickname, options = {}) {
  const user_id = await uid()
  if (!user_id) throw new Error('로그인이 필요해요.')
  const max_members = Math.min(50, Math.max(2, Number(options.maxMembers) || 10))
  const members_only = !!options.membersOnly
  await pushProfile(nickname)
  // 초대 코드 충돌 시 재시도 (최대 3회)
  for (let i = 0; i < 3; i++) {
    const invite_code = makeInviteCode()
    const { data, error } = await supabase
      .from('groups')
      .insert({ name, invite_code, created_by: user_id, max_members, members_only })
      .select('id, name, invite_code, max_members, members_only').single()
    if (!error && data) {
      await supabase.from('group_members').insert({ group_id: data.id, user_id })
      return data
    }
    if (error && !String(error.message).includes('duplicate')) throw new Error('그룹 생성에 실패했어요. 잠시 후 다시 시도해 주세요.')
  }
  throw new Error('그룹 생성에 실패했어요. 다시 시도해 주세요.')
}

export async function joinGroup(code, nickname) {
  const user_id = await uid()
  if (!user_id) throw new Error('로그인이 필요해요.')
  const clean = (code || '').trim().toUpperCase()
  if (clean.length !== 6) throw new Error('초대 코드는 6자리예요.')
  const { data: rows } = await supabase.rpc('find_group_by_invite_code', { code: clean })
  const g = rows?.[0]
  if (!g) throw new Error('초대 코드를 찾을 수 없어요. 다시 확인해 주세요.')

  // 인원수 제한 확인
  const { data: count } = await supabase.rpc('group_member_count', { gid: g.id })
  if (typeof count === 'number' && count >= g.max_members) {
    throw new Error(`이 그룹은 정원(${g.max_members}명)이 가득 찼어요.`)
  }

  // 회원만 받기: 이름·전화번호를 등록한 정회원만 참여 가능
  if (g.members_only) {
    const { data: me } = await supabase
      .from('profiles').select('full_name, phone').eq('id', user_id).maybeSingle()
    if (!me?.full_name || !me?.phone) {
      throw new Error('이 그룹은 이름·전화번호를 등록한 회원만 참여할 수 있어요. 설정에서 회원가입을 완료해 주세요.')
    }
  }

  await pushProfile(nickname)
  const { error } = await supabase.from('group_members').insert({ group_id: g.id, user_id })
  if (error && !String(error.message).includes('duplicate')) throw new Error('참여에 실패했어요. 잠시 후 다시 시도해 주세요.')
  return g
}

export async function leaveGroup(groupId) {
  const user_id = await uid()
  if (!user_id) return
  await supabase.from('group_members').delete().eq('group_id', groupId).eq('user_id', user_id)
}

// 그룹 멤버 + 최근 7일 운동현황 + 오늘의 인증샷
export async function fetchGroupStatus(groupId) {
  const { data: mem } = await supabase
    .from('group_members').select('user_id').eq('group_id', groupId)
  const ids = (mem || []).map(m => m.user_id)
  if (!ids.length) return { members: [], photos: [] }
  const since = new Date(); since.setDate(since.getDate() - 6)
  const sinceKey = since.toISOString().slice(0, 10)
  const todayStr = new Date().toISOString().slice(0, 10)
  const [{ data: profs }, { data: works }] = await Promise.all([
    supabase.rpc('get_group_profiles', { gid: groupId }),
    supabase.from('workouts').select('user_id, date, photo_url').in('user_id', ids).gte('date', sinceKey),
  ])
  const names = Object.fromEntries((profs || []).map(p => [p.id, p.nickname]))
  const avatars = Object.fromEntries((profs || []).map(p => [p.id, p.avatar_url || '']))
  const doneDates = {}
  const photos = []
  for (const w of works || []) {
    (doneDates[w.user_id] ||= new Set()).add(w.date)
    if (w.date === todayStr && w.photo_url) {
      photos.push({ id: w.user_id, name: names[w.user_id] || '이름 없음', url: w.photo_url })
    }
  }
  const members = ids.map(id => ({
    id,
    name: names[id] || '이름 없음',
    avatar: avatars[id] || '',
    dates: doneDates[id] || new Set(),
  }))
  return { members, photos }
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
