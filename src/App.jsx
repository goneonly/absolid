import { useState, useCallback, useEffect } from 'react'
import Home from './pages/Home.jsx'
import Workout from './pages/Workout.jsx'
import Group from './pages/Group.jsx'
import Settings from './pages/Settings.jsx'
import Admin from './pages/Admin.jsx'
import BottomNav from './components/BottomNav.jsx'
import OnboardingModal from './components/OnboardingModal.jsx'
import { getRecords, mergeRecords, cleanupLocalPhotos, todayKey } from './storage.js'
import { useAuth } from './useAuth.js'
import { flushPendingProfile, signOut } from './auth.js'
import { fetchServerRecords, syncLocalToServer, cleanupOldServerPhotos } from './api.js'
import { fetchMyRole } from './admin.js'

const CLEANUP_KEY = 'absolid.cleanup.v1'
const ONBOARD_KEY = 'absolid.onboarding.v1'

export default function App() {
  // view: home | workout | group | settings | admin
  const [view, setView] = useState('home')
  const [, setTick] = useState(0)
  const [isAdmin, setIsAdmin] = useState(false)
  const [showOnboarding, setShowOnboarding] = useState(false)
  const refresh = useCallback(() => setTick(t => t + 1), [])
  const session = useAuth()
  const records = getRecords()

  // 앱 시작 시: 7일 지난 로컬 인증샷 정리 (localStorage 용량 보호)
  useEffect(() => { cleanupLocalPhotos(7) }, [])

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
    return 