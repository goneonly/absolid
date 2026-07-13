// 인증 헬퍼 — supabase 미연결 시 모두 no-op
import { supabase } from './supabase.js'

const ERROR_KO = {
  'Invalid login credentials': '이메일 또는 비밀번호가 올바르지 않아요.',
  'User already registered': '이미 가입된 이메일이에요.',
  'Password should be at least 6 characters.': '비밀번호는 6자 이상이어야 해요.',
  'Email not confirmed': '이메일 인증이 필요해요. 메일함을 확인해 주세요.',
  'Unable to validate email address: invalid format': '이메일 형식이 올바르지 않아요.',
}
function ko(msg) { return ERROR_KO[msg] || `오류: ${msg}` }

const PENDING_PROFILE_KEY = 'absolid.pendingProfile.v1'

export async function signUp(email, password, nickname, fullName, phone) {
  const { data, error } = await supabase.auth.signUp({ email, password })
  if (error) return { error: ko(error.message) }
  const profile = {
    nickname: nickname || fullName || '',
    full_name: fullName || '',
    phone: phone || '',
  }
  if (data.session && data.user) {
    await supabase.from('profiles').upsert({ id: data.user.id, ...profile })
  } else {
    // 이메일 인증 대기 중엔 세션이 없어 RLS가 저장을 막음 → 첫 로그인 때 반영
    localStorage.setItem(PENDING_PROFILE_KEY, JSON.stringify(profile))
  }
  return { data }
}

// 가입 시 저장하지 못한 프로필을 로그인 후 서버에 반영
export async function flushPendingProfile() {
  const raw = localStorage.getItem(PENDING_PROFILE_KEY)
  if (!raw || !supabase) return
  const { data } = await supabase.auth.getSession()
  const user = data.session?.user
  if (!user) return
  try {
    await supabase.from('profiles').upsert({ id: user.id, ...JSON.parse(raw) })
    localStorage.removeItem(PENDING_PROFILE_KEY)
  } catch { /* 다음 로그인 때 재시도 */ }
}

export async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) return { error: ko(error.message) }
  return { data }
}

export async function signOut() {
  await supabase.auth.signOut()
}

export async function saveNickname(nickname) {
  const { data } = await supabase.auth.getSession()
  const user = data.session?.user
  if (!user) return
  await supabase.from('profiles').upsert({ id: user.id, nickname })
}
