import { useState, useCallback, useEffect } from 'react'
import Home from './pages/Home.jsx'
import Workout from './pages/Workout.jsx'
import Group from './pages/Group.jsx'
import Settings from './pages/Settings.jsx'
import BottomNav from './components/BottomNav.jsx'
import { getRecords, mergeRecords, cleanupLocalPhotos, todayKey } from './storage.js'
import { useAuth } from './useAuth.js'
import { flushPendingProfile } from './auth.js'
import { fetchServerRecords, syncLocalToServer, cleanupOldServerPhotos } from './api.js'

const CLEANUP_KEY = 'absday.cleanup.v1'

export default function App() {
  // view: home | workout | group | settings
  const [view, setView] = useState('home')
  const [, setTick] = useState(0)
  const refresh = useCallback(() => setTick(t => t + 1), [])
  const session = useAuth()
  const records = getRecords()

  // 앱 시작 시: 7일 지난 로컬 인증샷 정리 (localStorage 용량 보호)
  useEffect(() => { cleanupLocalPhotos(7) }, [])

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
    <div className="app">
      <header className="header">
        <button className="logo" onClick={() => setView('home')} aria-label="홈으로">
          <svg width="26" height="26" viewBox="0 0 26 26" fill="none" aria-hidden="true">
            <rect x="1" y="1" width="24" height="24" rx="7" fill="#ff3b30" />
            <path d="M8 18 L13 7 L18 18" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" fill="none" />
            <path d="M10 14.5 H16" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" />
          </svg>
          <strong>Abs<em>Day</em></strong>
        </button>
        {session && <span className="tag">로그인됨</span>}
      </header>

      {view === 'home' && <Home records={records} onStart={() => setView('workout')} />}
      {view === 'workout' && <Workout session={session} onDone={() => { refresh(); setView('home') }} />}
      {view === 'group' && <Group records={records} session={session} />}
      {view === 'settings' && <Settings session={session} onChanged={refresh} />}

      <BottomNav view={view} onChange={setView} />
    </div>
  )
}
