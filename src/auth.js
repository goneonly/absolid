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

export async function signUp(email, password, nickname, fullName, phone) {
  const { data, error } = await supabase.auth.signUp({ email, password })
  if (error) return { error: ko(error.message) }
  if (data.user) {
    await supabase.from('profiles').upsert({
      id: data.user.id,
      nickname: nickname || fullName || '',
      full_name: fullName || '',
      phone: phone || '',
    })
  }
  return { data }
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
  await supabase.from('profiles').upsert({ id: user.id, nickname, updated_at: new Date().toISOString() })
}
