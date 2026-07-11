import { computeStreak, lastNDays, todayKey, todayWorkoutDay } from '../storage.js'

const DOW = ['일', '월', '화', '수', '목', '금', '토']

export default function Home({ records, onStart }) {
  const streak = computeStreak(records)
  const doneToday = !!records[todayKey()]?.completed
  const week = lastNDays(7, records)
  const day = todayWorkoutDay()

  return (
    <main className="page">
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

      <button className="cta" onClick={onStart}>
        {doneToday ? '오늘 운동 다시 보기' : `Day ${day} 운동 시작하기`}
      </button>
    </main>
  )
}
