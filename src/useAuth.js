import { useEffect, useState } from 'react'
import { supabase } from './supabase.js'

// 반환값: undefined = 세션 확인 중, null = 로그인 안 됨, 객체 = 로그인됨
export function useAuth() {
  const [session, setSession] = useState(supabase ? undefined : null)
  useEffect(() => {
    if (!supabase) return
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])
  return session
}
