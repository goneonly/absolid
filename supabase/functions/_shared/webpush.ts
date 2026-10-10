// 웹 푸시 발송 공통 코드 — send-reminders, notify-cheer 에서 사용
// 시크릿: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (docs/NOTIFICATIONS_SETUP.md)
import webpush from 'npm:web-push@3.6.7'
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'

let configured = false
function configure() {
  if (configured) return
  webpush.setVapidDetails(
    Deno.env.get('VAPID_SUBJECT') || 'mailto:admin@absolid.app',
    Deno.env.get('VAPID_PUBLIC_KEY')!,
    Deno.env.get('VAPID_PRIVATE_KEY')!,
  )
  configured = true
}

export type PushPayload = { title: string; body: string; url?: string; tag?: string }

// 지정한 사용자들의 모든 기기로 발송 — 만료된 구독(404/410)은 정리
// admin: service_role 클라이언트 (push_subscriptions 는 RLS 상 본인 것만 보이므로)
export async function sendPushToUsers(admin: SupabaseClient, userIds: string[], payload: PushPayload) {
  if (!userIds.length) return { sent: 0, cleaned: 0 }
  configure()
  const { data: subs, error } = await admin
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .in('user_id', userIds)
  if (error) throw error

  const body = JSON.stringify(payload)
  let sent = 0
  const expired: number[] = []
  await Promise.all((subs || []).map(async (s) => {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, body)
      sent++
    } catch (err) {
      const code = (err as { statusCode?: number }).statusCode
      if (code === 404 || code === 410) expired.push(s.id) // 구독 만료/취소
    }
  }))
  if (expired.length) await admin.from('push_subscriptions').delete().in('id', expired)
  return { sent, cleaned: expired.length }
}

// KST(UTC+9) 기준 오늘 날짜 — 앱의 todayKey()와 같은 YYYY-MM-DD 형식
export function todayKST(): string {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10)
}
