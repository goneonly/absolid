import { useState, useCallback, useEffect } from 'react'
import Home from './pages/Home.jsx'
import Workout from './pages/Workout.jsx'
import Group from './pages/Group.jsx'
import Settings from './pages/Settings.jsx'
import Admin from './pages/Admin.jsx'
import BottomNav from './components/BottomNav.jsx'
import { Page, PageTitle, Sub } from './components/ui.jsx'
import OnboardingModal from './components/OnboardingModal.jsx'
import PushConsentModal from './components/PushConsentModal.jsx'
import RecoveryModal from './components/RecoveryModal.jsx'
import { supabase } from './supabase.js'
import { isPushSupported } from './push.js'
import { getRecords, mergeRecords, cleanupLocalPhotos, todayKey } from './storage.js'
import { useAuth } from './useAuth.js'
import { flushPendingProfile, signOut } from './auth.js'
import { fetchServerRecords, syncLocalToServer, cleanupOldServerPhotos } from './api.js'
import { fetchMyRole } from './admin.js'

const CLEANUP_KEY = 'absolid.cleanup.v1'
const ONBOARD_KEY = 'absolid.onboarding.v1'
const PUSH_CONSENT_KEY = 'absolid.pushconsent.v1'

export default function App() {
  // view: home | workout | group | settings | admin
  const [view, setView] = useState('home')
  const [, setTick] = useState(0)
  const [isAdmin, setIsAdmin] = useState(false)
  const [showOnboarding, setShowOnboarding] = useState(false)
  const [showPushConsent, setShowPushConsent] = useState(false)
  const [showRecovery, setShowRecovery] = useState(false)
  const refresh = useCallback(() => setTick(t => t + 1), [])
  const session = useAuth()
  const records = getRecords()
  const accountKey = session?.user?.id || 'guest'

  // 앱 시작 시: 7일 지난 로컬 인증샷 정리 (localStorage 용량 보호)
  useEffect(() => { cleanupLocalPhotos(7) }, [])

  // 비밀번호 재설정 메일 링크로 진입하면 새 비밀번호 설정 모달 표시
  useEffect(() => {
    if (!supabase) return
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') { setView('settings'); setShowRecovery(true) }
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  // 가입 완료 후 첫 진입: 홈으로 이동 + 기능 소개 팝업 1회
  useEffect(() => {
    if (session && localStorage.getItem(ONBOARD_KEY) === 'pending') {
      setView('home')
      setShowOnboarding(true)
    }
  }, [session])

  // 로그인 시: 역할 확인 (관리자 메뉴 노출) + 비활성 계정 차단
  useEffect(() => {
    if (!session) { setIsAdmin(false); return }
    let alive = true
    fetchMyRole().then(({ role, isActive }) => {
      if (!alive) return
      if (!isActive) {
        alert('이용이 제한된 계정이에요. 문의가 필요하면 관리자에게 연락해 주세요.')
        signOut()
        return
      }
      setIsAdmin(role === 'admin')
    }).catch(() => {})
    return () => { alive = false }
  }, [session])

  // 로그인되면: 서버 기록 내려받아 병합 + 비회원 시절 로컬 기록 서버로 업로드
  // + 하루 1회, 30일 지난 내 서버 인증샷 정리
  useEffect(() => {
    if (!session) return
    let alive = true
    flushPendingProfile().catch(() => {}) // 가입 시 못 올린 이름·전화번호 반영
    syncLocalToServer()
      .then(fetchServerRecords)
      .then(server => { if (alive && server) { mergeRecords(server); refresh() } })
      .catch(() => {})
    if (localStorage.getItem(CLEANUP_KEY) !== todayKey()) {
      cleanupOldServerPhotos(30)
        .then(() => localStorage.setItem(CLEANUP_KEY, todayKey()))
        .catch(() => {})
    }
    return () => { alive = false }
  }, [session, refresh])

  return (
    <div className="flex min-h-dvh flex-col pb-22">
      <header className="flex items-center justify-between px-5 pt-4.5 pb-2.5">
        <button className="flex items-center gap-2" onClick={() => setView('home')} aria-label="홈으로">
          <svg width="26" height="26" viewBox="0 0 26 26" fill="none" aria-hidden="true">
            <rect x="1" y="1" width="24" height="24" rx="7" fill="var(--color-brand)" />
            <path d="M8 18 L13 7 L18 18" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" fill="none" />
            <path d="M10 14.5 H16" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" />
          </svg>
          <strong className="text-xl font-extrabold tracking-tight">Abs<em className="text-brand not-italic">olid</em></strong>
        </button>
        {session && <span className="rounded-sm bg-surface-2 px-2 py-0.5 text-2xs font-bold text-dim">로그인됨</span>}
      </header>

      {view === 'home' && <Home records={records} onStart={() => setView('workout')} />}
      {view === 'workout' && <Workout session={session} onDone={() => { refresh(); setView('home') }} />}
      {/* 계정이 바뀌면 화면 상태(닉네임 입력값·선택한 그룹 등)를 새로 시작 */}
      {view === 'group' && <Group key={accountKey} records={records} session={session} />}
      {view === 'settings' && <Settings key={accountKey} session={session} onChanged={refresh} isAdmin={isAdmin} onOpenAdmin={() => setView('admin')} />}
      {view === 'admin' && (isAdmin
        ? <Admin onBack={() => setView('settings')} />
        : <Page><PageTitle>관리자</PageTitle><Sub>접근 권한이 없어요.</Sub></Page>)}

      {showOnboarding && (
        <OnboardingModal
          onClose={() => {
            localStorage.setItem(ONBOARD_KEY, 'done')
            setShowOnboarding(false)
            // 온보딩 종료 후: 푸시 알림 동의 팝업을 1회 표시 (지원 브라우저만)
            if (isPushSupported() && !localStorage.getItem(PUSH_CONSENT_KEY)) {
              setShowPushConsent(true)
            }
          }}
        />
      )}

      {showPushConsent && (
        <PushConsentModal
          onClose={() => {
            localStorage.setItem(PUSH_CONSENT_KEY, 'done')
            setShowPushConsent(false)
          }}
        />
      )}

      {showRecovery && <RecoveryModal onClose={() => setShowRecovery(false)} />}

      <BottomNav view={view} onChange={setView} />
    </div>
  )
}
