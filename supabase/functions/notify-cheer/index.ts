// 응원 알림 — Supabase Edge Function
// 앱에서 응원을 보낸 직후 호출: 받은 사람의 기기로 푸시 알림 발송
// 배포: npx supabase functions deploy notify-cheer
// 보안: 호출자 JWT 로 본인 확인 → 본인이 보낸, 아직 알림 안 보낸, 10분 이내 응원만 발송 (중복·스팸 방지)
import { createClient } from 'npm:@supabase/supabase-js@2'
import { sendPushToUsers } from '../_shared/webpush.ts'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  const url = Deno.env.get('SUPABASE_URL')!
  const asUser = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') || '' } },
  })
  const { data: { user } } = await asUser.auth.getUser()
  if (!user) return json({ error: 'Unauthorized' }, 401)

  const { cheerId } = await req.json().catch(() => ({}))
  if (!cheerId) return json({ error: 'cheerId 가 필요해요.' }, 400)

  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  // 알림 발송 권한 확보: 내가 보낸 응원 + 아직 미발송 + 10분 이내 → notified_at 기록 (한 번만 성공)
  const since = new Date(Date.now() - 10 * 60 * 1000).toISOString()
  const { data: cheer, error } = await admin
    .from('cheers')
    .update({ notified_at: new Date().toISOString() })
    .eq('id', cheerId)
    .eq('from_user', user.id)
    .is('notified_at', null)
    .gte('created_at', since)
    .select('to_user, kind, group_id')
    .maybeSingle()
  if (error) return json({ error: error.message }, 500)
  if (!cheer) return json({ sent: 0, skipped: true })

  const [{ data: me }, { data: group }] = await Promise.all([
    admin.from('profiles').select('nickname').eq('id', user.id).maybeSingle(),
    admin.from('groups').select('name').eq('id', cheer.group_id).maybeSingle(),
  ])
  const name = me?.nickname || '그룹 멤버'
  const where = group?.name ? `[${group.name}] ` : ''
  const body = cheer.kind === 'done'
    ? `${where}${name}님이 오늘 운동을 응원했어요 👏`
    : `${where}${name}님이 응원을 보냈어요 💪 오늘 운동하러 가볼까요?`

  const result = await sendPushToUsers(admin, [cheer.to_user], {
    title: 'Absolid',
    body,
    url: '/',
    tag: `absolid-cheer-${cheerId}`,
  })
  return json(result)
})
