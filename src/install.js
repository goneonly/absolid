// 홈 화면에 앱 추가(PWA 설치) 도우미
// - 안드로이드 Chrome 등: 브라우저가 주는 설치 이벤트를 받아 두었다가 버튼으로 바로 설치 창 띄움
// - 아이폰 Safari: 설치 창 API가 없어 '공유 → 홈 화면에 추가' 안내만 가능
let deferredPrompt = null

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault() // 브라우저 기본 배너 대신 설정 화면 버튼으로
    deferredPrompt = e
  })
  window.addEventListener('appinstalled', () => { deferredPrompt = null })
}

// 이미 홈 화면 앱으로 실행 중인지
export function isStandalone() {
  return window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true
}

export function isIOS() {
  const ua = navigator.userAgent
  return /iPhone|iPad|iPod/.test(ua) || (ua.includes('Macintosh') && navigator.maxTouchPoints > 1)
}

export const canPromptInstall = () => !!deferredPrompt

// 설치 창 띄우기 → true = 설치함
export async function promptInstall() {
  if (!deferredPrompt) return false
  deferredPrompt.prompt()
  const { outcome } = await deferredPrompt.userChoice
  deferredPrompt = null
  return outcome === 'accepted'
}
