// Absolid 서비스 워커 — 푸시 알림 수신/클릭 처리 (운동 리마인더·응원)
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()))

self.addEventListener('push', (event) => {
  let data = {}
  try { data = event.data ? event.data.json() : {} } catch { /* noop */ }
  const title = data.title || 'Absolid 💪'
  const options = {
    body: data.body || '오늘 아직 운동 기록이 없어요. 복근 챙기러 가요!',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: data.tag || 'absolid-reminder', // 같은 태그면 중복 대신 갱신 (응원은 건마다 다른 태그)
    data: { url: data.url || '/' },
  }
  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = new URL(event.notification.data?.url || '/', self.location.origin).href
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      // 이미 열린 앱 창이 있으면 그 창을 앞으로 (필요하면 해당 주소로 이동)
      for (const c of list) {
        if ('focus' in c) {
          return c.focus().then((w) => (w && w.url !== url && 'navigate' in w ? w.navigate(url) : w))
        }
      }
      return self.clients.openWindow(url)
    })
  )
})
