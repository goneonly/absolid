// Supabase 키 선택 — 새 방식 키(sb_secret_ / sb_publishable_)를 우선 사용
// 예전 방식 JWT 키(SUPABASE_SERVICE_ROLE_KEY 등)는 서버가 "JWT issued at future" 로 거부하는 경우가 있어 보조로만 사용
// (새 키는 Supabase 가 SUPABASE_SECRET_KEYS / SUPABASE_PUBLISHABLE_KEYS 에 JSON 으로 자동 주입)
function pick(jsonEnv: string, prefix: string, legacyEnv: string): string {
  const raw = Deno.env.get(jsonEnv)
  if (raw) {
    try {
      const parsed = JSON.parse(raw)
      const value = typeof parsed === 'string' ? parsed : parsed.default ?? Object.values(parsed)[0]
      if (typeof value === 'string' && value) return value
    } catch {
      if (raw.startsWith(prefix)) return raw
    }
  }
  return Deno.env.get(legacyEnv)!
}
export const serviceKey = () => pick('SUPABASE_SECRET_KEYS', 'sb_secret_', 'SUPABASE_SERVICE_ROLE_KEY')
export const publishableKey = () => pick('SUPABASE_PUBLISHABLE_KEYS', 'sb_publishable_', 'SUPABASE_ANON_KEY')
// 예전 크론 설정 호환: Authorization 에 넣어 보낸 키가 새 키·예전 키 중 하나와 같으면 인정
export const isServiceKey = (bearer: string) =>
  bearer === serviceKey() || bearer === Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
