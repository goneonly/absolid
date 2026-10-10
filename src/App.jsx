import { useState, useCallback, useEffect } from 'react'
import Home from './pages/Home.jsx'
import Workout from './pages/Workout.jsx'
import Group from './pages/Group.jsx'
import Settings from './pages/Settings.jsx'
import Admin from './pages/Admin.jsx'
import BottomNav from './components/BottomNav.jsx'
import { Logo, Page, PageTitle, Sub } from './components/ui.jsx'
import Login from './pages/Login.jsx'
import OnboardingModal from './components/OnboardingModal.jsx'
import PushConsentModal from './components/PushConsentModal.jsx'
import RecoveryModal from './components/RecoveryModal.jsx'
import { supabase } from './supabase.js'
import { isPushSupported } from './push.js'
import {
  getRecords, mergeRecords, cleanupLocalPhotos,
  isGuestChosen, setGuestChosen, isOnboardingPending, markOnboardingDone,
  isPushConsentAsked, markPushConsentAsked, isServerCleanupDoneToday, markServerCleanupDone,
} from './storage.js'
import { useAuth } from './useAuth.js'
import { flushPendingProfile, signOut } from './auth.js'
import { fetchServerRecords, retryPendingCompletions, cleanupOldServerPhotos } from './api.js'
import { fetchMyRole } from './admin.js'


export default function App() {
  // view: home | workout | group | settings | admin
  const [view, setView] = useState('home')
  const [, setTick] = useState(0)
  const [isAdmin, setIsAdmin] = useState(false)
  const [showOnboarding, setShowOnboarding] = useState(false)
  const [showPushConsent, setShowPushConsent] = useState(false)
  const [showRecovery, setShowRecovery] = useState(false)
  const [guest, setGuest] = useState(isGuestChosen)
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
      // 로그아웃·탈퇴하면 다시 첫 로그인 화면부터
      if (event === 'SIGNED_OUT') {
        setGuestChosen(false)
        setGuest(false)
        setView('home')
      }
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  // 기능 소개 팝업: 가입 완료 후 첫 진입 1회 (비회원은 '비회원으로 시작하기'를 누를 때마다 — Login onGuest)
  useEffect(() => {
    if (session && isOnboardingPending()) {
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

  // 로그인되면: 연결 문제로 못 남긴 완료 기록 재시도 + 서버 기록 내려받아 병합
  // (비회원 시절 기록은 시청 확인이 없어 서버로 올리지 않음 — 기기에만 남음)
  // + 하루 1회, 30일 지난 내 서버 인증샷 정리
  useEffect(() => {
    if (!session) return
    let alive = true
    flushPendingProfile().catch(() => {}) // 가입 시 못 올린 이름·전화번호 반영
    retryPendingCompletions()
      .then(fetchServerRecords)
      .then(server => { if (alive && server) { mergeRecords(server); refresh() } })
      .catch(() => {})
    if (!isServerCleanupDoneToday()) {
      cleanupOldServerPhotos(30)
        .then(markServerCleanupDone)
        .catch(() => {})
    }
    return () => { alive = false }
  }, [session, refresh])

  // 첫 화면: 서버 연결 시, 로그인도 비회원 선택도 안 했으면 로그인 화면
  if (session === undefined) return null // 저장된 세션 확인 중 (로그인 화면이 깜빡이지 않게)
  if (supabase && !session && !guest) {
    return (
      <Login
        onDone={() => setView('home')}
        onGuest={() => {
          setGuestChosen(true)
          setGuest(true)
          setView('home')
          setShowOnboarding(true) // 비회원으로 시작할 때마다 사용법 소개
        }}
      />
    )
  }

  return (
    <div className="flex min-h-dvh flex-col pb-22">
      <header className="flex items-center justify-between px-5 pt-4.5 pb-2.5">
        <button onClick={() => setView('home')} aria-label="홈으로">
          <Logo className="text-xl" />
        </button>
        {session && <span className="rounded-sm bg-surface-2 px-2 py-0.5 text-2xs font-bold text-dim">로그인됨</span>}
      </header>

      {view === 'home' && <Home records={records} session={session} onStart={() => setView('workout')} />}
      {view === 'workout' && <Workout session={session} onDone={() => { refresh(); setView('home') }} />}
      {/* 계정이 바뀌면 화면 상태(닉네임 입력값·선택한 그룹 등)를 새로 시작 */}
      {view === 'group' && <Group key={accountKey} records={records} session={session} />}
      {view === 'settings' && (
        <Settings
          key={accountKey}
          session={session}
          onChanged={refresh}
          isAdmin={isAdmin}
          onOpenAdmin={() => setView('admin')}
          onRequestLogin={() => {
            // 비회원 선택을 해제하면 첫 로그인 화면이 다시 표시됨
            setGuestChosen(false)
            setGuest(false)
          }}
        />
      )}
      {view === 'admin' && (isAdmin
        ? <Admin onBack={() => setView('settings')} />
        : <Page><PageTitle>관리자</PageTitle><Sub>접근 권한이 없어요.</Sub></Page>)}

      {showOnboarding && (
        <OnboardingModal
          onClose={() => {
            markOnboardingDone()
            setShowOnboarding(false)
            // 온보딩 종료 후: 푸시 알림 동의 팝업을 1회 표시 (지원 브라우저 + 회원만 — 푸시는 로그인 필요)
            if (session && isPushSupported() && !isPushConsentAsked()) {
              setShowPushConsent(true)
            }
          }}
        />
      )}

      {showPushConsent && (
        <PushConsentModal
          onClose={() => {
            markPushConsentAsked()
            setShowPushConsent(false)
          }}
        />
      )}

      {showRecovery && <RecoveryModal onClose={() => setShowRecovery(false)} />}

      <BottomNav view={view} onChange={setView} />
    </div>
  )
}
