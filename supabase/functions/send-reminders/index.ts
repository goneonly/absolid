// 미운동 회원 푸시 리마인더 — Supabase Edge Function
// 오늘(KST) 운동 기록이 없는 푸시 구독자에게 Web Push를 발송합니다.
// 배포: supabase functions deploy send-reminders
// 시크릿: supabase secrets set VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=... VAPID_SUBJECT=mailto:you@example.com
// 스케줄: supabase/notifications.sql 하단의 pg_cron 스니펫 참고 (매일 KST 20:00)

import { createClient } from 'npm:@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'

// KST(UTC+9) 기준 오늘 날짜 — 앱의 todayKey()와 동일한 YYYY-MM-DD 형식
function todayKST(): string {
  const now = new Date(Date.now() + 9 * 60 * 60 * 1000)
  return now.toISOString().slice(0, 10)
}

Deno.serve(async (req) => {
  // 크론(net.http_post)이 service role 키로 호출 — 익명 호출 차단
  const auth = req.headers.get('Authorization') || ''
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  if (auth !== `Bearer ${serviceKey}`) {
    return new Response('Unauthorized', { status: 401 })
  }

  webpush.setVapidDetails(
    Deno.env.get('VAPID_SUBJECT') || 'mailto:admin@absolid.app',
    Deno.env.get('VAPID_PUBLIC_KEY')!,
    Deno.env.get('VAPID_PRIVATE_KEY')!,
  )

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, serviceKey)
  const today = todayKST()

  // 1) 모든 푸시 구독 + 오늘 운동한 사람 목록
  const [{ data: subs, error: e1 }, { data: done, error: e2 }] = await Promise.all([
    supabase.from('push_subscriptions').select('id, user_id, endpoint, p256dh, auth'),
    supabase.from('workouts').select('user_id').eq('date', today),
  ])
  if (e1 || e2) {
    return new Response(JSON.stringify({ error: (e1 || e2)!.message }), { status: 500 })
  }

  const doneSet = new Set((done || []).map((w) => w.user_id))
  const targets = (subs || []).filter((s) => !doneSet.has(s.user_id))

  // 2) 미운동 구독자에게 발송 (만료된 구독은 정리)
  const payload = JSON.stringify({
    title: 'Absolid 💪',
    body: '오늘 아직 운동 기록이 없어요. 자기 전에 복근 챙겨요!',
    url: '/',
  })

  let sent = 0
  const expired: number[] = []
  await Promise.all(targets.map(async (s) => {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        payload,
      )
      sent++
    } catch (err) {
      const code = (err as { statusCode?: number }).statusCode
      if (code === 404 || code === 410) expired.push(s.id) // 구독 만료/취소
    }
  }))
  if (expired.length) {
    await supabase.from('push_subscriptions').delete().in('id', expired)
  }

  return new Response(
    JSON.stringify({ date: today, targets: targets.length, sent, cleaned: expired.length }),
    { headers: { 'Content-Type': 'application/json' } },
  )
})
