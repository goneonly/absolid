// Supabase 연결 — .env에 키를 넣으면 자동 활성화, 없으면 로컬(비회원) 모드
import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = url && key ? createClient(url, key) : null
