// Absolid 서비스 워커 — 브라우저 푸시 알림 수신/클릭 처리
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()))

self.addEventListener('push', (event) => {
  let data = {}
  try { data = event.data ? event.data.json() : {} } catch { /* noop */ }
  const title = data.title || 'Absolid 💪'
  const options = {
    body: data.body || '오늘 아직 운동 기록이 없어요. 복근 챙기러 가요!',
    icon: '/favicon.svg',
    badge: '/favicon.svg',
    tag: 'absolid-reminder', // 같은 태그면 중복 알림 대신 갱신
    data: { url: data.url || '/' },
  }
  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = event.notification.data?.url || '/'
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if ('focus' in c) return c.focus()
      }
      return self.clients.openWindow(url)
    })
  )
})
