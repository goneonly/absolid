// 브라우저 푸시 알림 구독 관리 (Web Push + Supabase)
// 사용 조건: HTTPS(또는 localhost), 로그인 상태, .env에 VITE_VAPID_PUBLIC_KEY 설정
import { supabase } from './supabase.js'

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY || ''

export function isPushSupported() {
  return !!(supabase && VAPID_PUBLIC_KEY &&
    'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window)
}

// base64url → Uint8Array (pushManager.subscribe가 요구하는 형식)
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)))
}

async function getRegistration() {
  return navigator.serviceWorker.register('/sw.js')
}

// 현재 이 브라우저에서 푸시가 켜져 있는지
export async function getPushEnabled() {
  if (!isPushSupported() || Notification.permission !== 'granted') return false
  try {
    const reg = await navigator.serviceWorker.getRegistration()
    return !!(await reg?.pushManager.getSubscription())
  } catch { return false }
}

// 푸시 켜기: 권한 요청 → 구독 → 서버 저장
export async function enablePush() {
  if (!isPushSupported()) throw new Error('이 브라우저는 푸시 알림을 지원하지 않아요.')
  const { data } = await supabase.auth.getSession()
  const user_id = data.session?.user?.id
  if (!user_id) throw new Error('로그인 후 사용할 수 있어요.')

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') {
    throw new Error('알림 권한이 거부됐어요. 브라우저 설정에서 허용해 주세요.')
  }

  const reg = await getRegistration()
  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
  })
  const json = sub.toJSON()
  const { error } = await supabase.from('push_subscriptions').upsert(
    { user_id, endpoint: json.endpoint, p256dh: json.keys.p256dh, auth: json.keys.auth },
    { onConflict: 'endpoint' }
  )
  if (error) {
    // 테이블이 아직 없는 경우(notifications.sql 미실행)를 구분해 안내
    const msg = String(error.message || '')
    if (msg.includes('push_subscriptions') || error.code === '42P01' || error.code === 'PGRST205') {
      throw new Error('서버에 알림 테이블이 없어요. supabase/notifications.sql을 실행해 주세요.')
    }
    throw new Error('구독 저장에 실패했어요. 잠시 후 다시 시도해 주세요.')
  }
  return true
}

// 푸시 끄기: 구독 해제 + 서버에서 삭제
export async function disablePush() {
  try {
    const reg = await navigator.serviceWorker.getRegistration()
    const sub = await reg?.pushManager.getSubscription()
    if (sub) {
      if (supabase) {
        await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
      }
      await sub.unsubscribe()
    }
  } catch { /* noop */ }
}
