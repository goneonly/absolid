import { useState, useCallback, useEffect } from 'react'
import Home from './pages/Home.jsx'
import Workout from './pages/Workout.jsx'
import Group from './pages/Group.jsx'
import Settings from './pages/Settings.jsx'
import BottomNav from './components/BottomNav.jsx'
import { getRecords, mergeRecords } from './storage.js'
import { useAuth } from './useAuth.js'
import { fetchServerRecords, syncLocalToServer } from './api.js'

export default function App() {
  // view: home | workout | group | settings
  const [view, setView] = useState('home')
  const [, setTick] = useState(0)
  const refresh = useCallback(() => setTick(t => t + 1), [])
  const session = useAuth()
  const records = getRecords()

  // 로그인되면: 서버 기록 내려받아 병합 + 비회원 시절 로컬 기록 서버로 업로드
  useEffect(() => {
    if (!session) return
    let alive = true
    syncLocalToServer()
      .then(fetchServerRecords)
      .then(server => { if (alive && server) { mergeRecords(server); refresh() } })
      .catch(() => {})
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
      {view === 'workout' && <Workout onDone={() => { refresh(); setView('home') }} />}
      {view === 'group' && <Group records={records} session={session} />}
      {view === 'settings' && <Settings session={session} onChanged={refresh} />}

      <BottomNav view={view} onChange={setView} />
    </div>
  )
}
