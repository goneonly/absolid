import { useEffect, useState } from 'react'
import { supabase } from './supabase.js'

export function useAuth() {
  const [session, setSession] = useState(null)
  useEffect(() => {
    if (!supabase) return
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])
  return session
}
