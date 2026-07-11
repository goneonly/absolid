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

export async function createGroup(name, nickname) {
  const user_id = await uid()
  if (!user_id) throw new Error('로그인이 필요해요.')
  await pushProfile(nickname)
  // 초대 코드 충돌 시 재시도 (최대 3회)
  for (let i = 0; i < 3; i++) {
    const invite_code = makeInviteCode()
    const { data, error } = await supabase
      .from('groups')
      .insert({ name, invite_code, created_by: user_id })
      .select('id, name, invite_code, max_members').single()
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
  const { data: g } = await supabase
    .from('groups').select('id, name, invite_code, max_members').eq('invite_code', clean).maybeSingle()
  if (!g) throw new Error('초대 코드를 찾을 수 없어요. 다시 확인해 주세요.')
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

// 그룹 멤버 + 최근 7일 운동현황
export async function fetchGroupStatus(groupId) {
  const { data: mem } = await supabase
    .from('group_members').select('user_id').eq('group_id', groupId)
  const ids = (mem || []).map(m => m.user_id)
  if (!ids.length) return []
  const since = new Date(); since.setDate(since.getDate() - 6)
  const sinceKey = since.toISOString().slice(0, 10)
  const [{ data: profs }, { data: works }] = await Promise.all([
    supabase.from('profiles').select('id, nickname').in('id', ids),
    supabase.from('workouts').select('user_id, date').in('user_id', ids).gte('date', sinceKey),
  ])
  const names = Object.fromEntries((profs || []).map(p => [p.id, p.nickname]))
  const doneDates = {}
  for (const w of works || []) (doneDates[w.user_id] ||= new Set()).add(w.date)
  return ids.map(id => ({
    id,
    name: names[id] || '이름 없음',
    dates: doneDates[id] || new Set(),
  }))
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
