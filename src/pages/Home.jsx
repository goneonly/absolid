import { useEffect, useState } from 'react'
import { computeStreak, lastNDays, todayKey, todayWorkoutDay } from '../storage.js'
import { fetchActiveAnnouncement } from '../admin.js'
import WeeklyReport from '../components/WeeklyReport.jsx'

const DOW = ['일', '월', '화', '수', '목', '금', '토']
const REMIND_DISMISS_KEY = 'absolid.remind.dismissed'
const REMIND_AFTER_HOUR = 18 // 저녁 6시 이후부터 리마인더 표시

export default function Home({ records, onStart }) {
  const streak = computeStreak(records)
  const doneToday = !!records[todayKey()]?.completed
  const week = lastNDays(7, records)
  const day = todayWorkoutDay()
  const [notice, setNotice] = useState(null)
  const [remindDismissed, setRemindDismissed] = useState(
    localStorage.getItem(REMIND_DISMISS_KEY) === todayKey()
  )

  useEffect(() => {
    fetchActiveAnnouncement().then(setNotice)
  }, [])

  // 앱 내 리마인더: 저녁이 됐는데 오늘 기록이 없으면 배너 표시 (하루 1회 닫기 가능)
  const showReminder =
    !doneToday && !remindDismissed && new Date().getHours() >= REMIND_AFTER_HOUR

  function dismissReminder() {
    localStorage.setItem(REMIND_DISMISS_KEY, todayKey())
    setRemindDismissed(true)
  }

  return (
    <main className="page">
      {notice && <div className="banner">📢 {notice.message}</div>}
      {showReminder && (
        <div className="banner reminder" role="alert">
          <span>⏰ 오늘 아직 운동 전이에요. 자기 전에 복근 챙겨요!</span>
          <span className="reminder-actions">
            <button className="linklike" onClick={onStart}>지금 시작</button>
            <button className="linklike" aria-label="리마인더 닫기" onClick={dismissReminder}>✕</button>
          </span>
        </div>
      )}
      <h2>오늘도 복근 챙기기 🔥</h2>
      <p className="sub">Day {day} 운동이 준비되어 있어요.</p>

      <section className="card streak-card">
        <div className="streak-num"><span>{streak}</span>일</div>
        <div className="streak-label">연속 운동 streak</div>
        <div className={'badge ' + (doneToday ? 'done' : 'todo')}>
          {doneToday ? '✓ 오늘 운동 완료!' : '오늘 아직 운동 전이에요'}
        </div>
      </section>

      <section className="card">
        <div className="sub" style={{ marginBottom: 12 }}>최근 7일</div>
        <div className="week">
          {week.map((d, i) => (
            <div className="day" key={d.key}>
              <div className={'dot' + (d.done ? ' done' : '') + (i === 6 ? ' today' : '')}>
                {d.done ? '✓' : d.date.getDate()}
              </div>
              {DOW[d.date.getDay()]}
            </div>
          ))}
        </div>
      </section>

      <WeeklyReport records={records} />

      <button className="cta" onClick={onStart}>
        {doneToday ? '오늘 운동 다시 보기' : `Day ${day} 운동 시작하기`}
      </button>
    </main>
  )
}
