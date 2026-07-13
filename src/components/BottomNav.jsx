export default function BottomNav({ view, onChange }) {
  return (
    <nav className="bottom-nav">
      <button className={'nav-btn' + (view === 'group' ? ' active' : '')} onClick={() => onChange('group')}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="9" cy="8" r="3.2" /><path d="M2.8 19c.7-3 3.2-4.6 6.2-4.6s5.5 1.6 6.2 4.6" />
          <circle cx="17" cy="9.5" r="2.4" /><path d="M16.5 14.6c2.4.2 4.2 1.5 4.7 4" />
        </svg>
        그룹
      </button>
      {view === 'workout' ? (
        <button className="nav-start" onClick={() => onChange('home')} aria-label="홈으로">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 10.5 12 3l9 7.5" />
            <path d="M5.5 9.5V21h13V9.5" />
          </svg>
          홈
        </button>
      ) : (
        <button className="nav-start" onClick={() => onChange('workout')} aria-label="운동 시작">
          <svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.5v13l11-6.5z" /></svg>
          시작
        </button>
      )}
      <button className={'nav-btn' + (view === 'settings' ? ' active' : '')} onClick={() => onChange('settings')}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="3.2" />
          <path d="M19.4 13.5a7.6 7.6 0 0 0 0-3l2-1.5-2-3.4-2.4 1a7.6 7.6 0 0 0-2.6-1.5L14 2.6h-4l-.4 2.5a7.6 7.6 0 0 0-2.6 1.5l-2.4-1-2 3.4 2 1.5a7.6 7.6 0 0 0 0 3l-2 1.5 2 3.4 2.4-1a7.6 7.6 0 0 0 2.6 1.5l.4 2.5h4l.4-2.5a7.6 7.6 0 0 0 2.6-1.5l2.4 1 2-3.4z" />
        </svg>
        설정
      </button>
    </nav>
  )
}
