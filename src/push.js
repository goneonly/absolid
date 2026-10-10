// 브라우저 푸시 알림 구독 관리 (Web Push + Supabase)
// 사용 조건: HTTPS(또는 localhost), 로그인 상태, .env에 VITE_VAPID_PUBLIC_KEY 설정
import { supabase } from './supabase.js'

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY || ''

// 서버·키 설정상 알림 기능이 켜진 배포인지 (브라우저 지원과 별개)
export function isPushConfigured() {
  return !!(supabase && VAPID_PUBLIC_KEY)
}

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
  // 서버 함수로 등록 — 이 기기에서 다른 계정이 켰던 구독도 현재 계정으로 옮김 (v0.8 SQL)
  const { error } = await supabase.rpc('register_push', {
    p_endpoint: json.endpoint, p_p256dh: json.keys.p256dh, p_auth: json.keys.auth,
  })
  if (error) throw new Error('알림 등록에 실패했어요. 잠시 후 다시 시도해 주세요.')
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
