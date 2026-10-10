// 미운동 회원 푸시 리마인더 — Supabase Edge Function
// 오늘(KST) 운동 기록이 없는 푸시 구독자에게 알림을 보냅니다. 매일 저녁 크론이 호출 (docs/NOTIFICATIONS_SETUP.md)
// 배포: npx supabase functions deploy send-reminders --no-verify-jwt
// 호출 인증: x-cron-secret 헤더 = CRON_SECRET 시크릿 (또는 service role 키) — 그 외 호출은 거부
import { createClient } from 'npm:@supabase/supabase-js@2'
import { sendPushToUsers, todayKST } from '../_shared/webpush.ts'

Deno.serve(async (req) => {
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const cronSecret = Deno.env.get('CRON_SECRET')
  const authorized =
    (cronSecret && req.headers.get('x-cron-secret') === cronSecret) ||
    req.headers.get('Authorization') === `Bearer ${serviceKey}`
  if (!authorized) return new Response('Unauthorized', { status: 401 })

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, serviceKey)
  const today = todayKST()

  // 구독자 중 오늘 운동 기록이 없는 사람
  const [{ data: subs, error: e1 }, { data: done, error: e2 }] = await Promise.all([
    admin.from('push_subscriptions').select('user_id'),
    admin.from('workouts').select('user_id').eq('date', today),
  ])
  if (e1 || e2) {
    return new Response(JSON.stringify({ error: (e1 || e2)!.message }), { status: 500 })
  }
  const doneSet = new Set((done || []).map((w) => w.user_id))
  const targets = [...new Set((subs || []).map((s) => s.user_id))].filter((id) => !doneSet.has(id))

  const result = await sendPushToUsers(admin, targets, {
    title: 'Absolid 💪',
    body: '오늘 아직 운동 기록이 없어요. 자기 전에 복근 챙겨요!',
    url: '/',
    tag: 'absolid-reminder',
  })
  return new Response(JSON.stringify({ date: today, targets: targets.length, ...result }), {
    headers: { 'Content-Type': 'application/json' },
  })
})
