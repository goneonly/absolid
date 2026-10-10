import { useEffect, useState } from 'react'
import {
  computeStreak, todayKey, todayWorkoutDay, isReminderDismissedToday, dismissReminderToday,
} from '../storage.js'
import { fetchActiveAnnouncement } from '../admin.js'
import { fetchReceivedCheers } from '../api.js'
import WeeklyReport from '../components/WeeklyReport.jsx'
import { Banner, Card, Page, PageTitle, Sub, cx } from '../components/ui.jsx'

const REMIND_AFTER_HOUR = 18 // 저녁 6시 이후부터 리마인더 표시

export default function Home({ records, onStart, session }) {
  const streak = computeStreak(records)
  const doneToday = !!records[todayKey()]?.completed
  const day = todayWorkoutDay()
  const [notice, setNotice] = useState(null)
  const [cheers, setCheers] = useState([]) // 오늘 받은 응원 (회원)
  const [remindDismissed, setRemindDismissed] = useState(isReminderDismissedToday)

  useEffect(() => {
    fetchActiveAnnouncement().then(setNotice)
  }, [])

  useEffect(() => {
    if (!session) return
    let alive = true
    fetchReceivedCheers().then((list) => alive && setCheers(list))
    return () => { alive = false }
  }, [session])

  // 앱 내 리마인더: 저녁이 됐는데 오늘 기록이 없으면 배너 표시 (하루 1회 닫기 가능)
  const showReminder =
    !doneToday && !remindDismissed && new Date().getHours() >= REMIND_AFTER_HOUR

  function dismissReminder() {
    dismissReminderToday()
    setRemindDismissed(true)
  }

  return (
    <Page>
      {notice && <Banner>📢 {notice.message}</Banner>}
      {showReminder && (
        <Banner className="flex items-center justify-between gap-2.5" role="alert">
          <span>⏰ 오늘 아직 운동 전이에요. 자기 전에 복근 챙겨요!</span>
          <span className="flex flex-none items-center gap-1">
            <button className="px-1.5 py-1 text-sm font-bold text-brand" onClick={onStart}>지금 시작</button>
            <button className="px-1.5 py-1 text-sm font-bold text-brand" aria-label="리마인더 닫기" onClick={dismissReminder}>✕</button>
          </span>
        </Banner>
      )}
      {cheers.length > 0 && <CheersBanner cheers={cheers} />}
      <PageTitle>오늘도 복근 챙기기 🔥</PageTitle>
      <Sub>Day {day} 운동이 준비되어 있어요.</Sub>

      <Card className="px-5 py-8 text-center">
        <div className="text-display font-extrabold tracking-tight"><span className="text-brand">{streak}</span>일</div>
        <div className="mt-2 text-base text-dim">연속 운동 streak</div>
        <div
          className={cx(
            'mt-4 inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-semibold',
            doneToday ? 'bg-brand/15 text-brand' : 'bg-surface-2 text-dim',
          )}
        >
          {doneToday ? '✓ 오늘 운동 완료!' : '오늘 아직 운동 전이에요'}
        </div>
      </Card>

      <WeeklyReport records={records} />
    </Page>
  )
}

// 오늘 받은 응원 — "민준·서연 외 1명이 응원했어요"
function CheersBanner({ cheers }) {
  const names = [...new Set(cheers.map((c) => c.from_nickname))]
  const shown = names.slice(0, 2).join('·')
  const rest = names.length - 2
  const allDone = cheers.every((c) => c.kind === 'done')
  return (
    <Banner>
      {allDone ? '👏' : '💪'} <strong>{shown}</strong>
      {rest > 0 && ` 외 ${rest}명`}님이 오늘 응원을 보냈어요
      {allDone ? '!' : '. 오늘 운동하러 가볼까요?'}
    </Banner>
  )
}
