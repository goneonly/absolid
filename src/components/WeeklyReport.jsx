import { useMemo } from "react";
import { todayKey, computeStreak, lastNDays } from "../storage.js";

const DOW = ["일", "월", "화", "수", "목", "금", "토"];

function mondayOf(d) {
  const x = new Date(d);
  const day = x.getDay(); // 0=일 … 6=토
  x.setDate(x.getDate() - (day === 0 ? 6 : day - 1)); // 월요일로
  x.setHours(0, 0, 0, 0);
  return x;
}

function keysFrom(start, n) {
  const out = [];
  const d = new Date(start);
  for (let i = 0; i < n; i++) {
    out.push(todayKey(d));
    d.setDate(d.getDate() + 1);
  }
  return out;
}

// 이번 주(월~일) 인증 요약 + 지난주 대비 + 최근 7일 현황
export default function WeeklyReport({ records }) {
  const data = useMemo(() => {
    const monday = mondayOf(new Date());
    const lastMonday = new Date(monday);
    lastMonday.setDate(lastMonday.getDate() - 7);
    const today = todayKey();

    const weekKeys = keysFrom(monday, 7);
    const lastWeekKeys = keysFrom(lastMonday, 7);
    const done = (k) => !!records[k]?.completed;

    const count = weekKeys.filter(done).length;
    const lastCount = lastWeekKeys.filter(done).length;
    const elapsed = Math.max(1, weekKeys.filter((k) => k <= today).length);
    const rate = Math.round((count / elapsed) * 100);

    return {
      count,
      lastCount,
      delta: count - lastCount,
      rate,
      streak: computeStreak(records),
      recent: lastNDays(7, records),
      range: `${weekKeys[0].slice(5).replace("-", ".")} ~ ${weekKeys[6]
        .slice(5)
        .replace("-", ".")}`,
    };
  }, [records]);

  const { count, lastCount, delta, rate, streak, recent, range } = data;

  const message =
    count === 0
      ? "이번 주 첫 운동을 시작해 볼까요? 💪"
      : delta > 0
        ? "지난주보다 더 활발해요! 이 기세 그대로 🔥"
        : delta < 0
          ? "지난주엔 더 열심이었어요. 오늘 한 번 어때요?"
          : "지난주와 같은 페이스로 꾸준해요 👍";

  return (
    <section className="card weekly-report">
      <div className="wr-head">
        <span className="wr-title">주간 리포트</span>
        <span className="sub" style={{ fontSize: 11 }}>
          이번 주 · {range}
        </span>
      </div>

      <div className="wr-stats">
        <div className="wr-stat">
          <b>
            {count}
            <span>회</span>
          </b>
          이번 주 인증
        </div>
        <div className="wr-stat">
          <b>
            {streak}
            <span>일</span>
          </b>
          연속 streak
        </div>
        <div className="wr-stat">
          <b>
            {rate}
            <span>%</span>
          </b>
          이번 주 달성률
        </div>
      </div>

      <div className="wr-bar" aria-hidden="true">
        <i style={{ width: `${Math.min(100, rate)}%` }} />
      </div>

      <p className="sub" style={{ marginTop: 10 }}>
        지난주 {lastCount}회
        {delta !== 0 && (
          <span className={"wr-delta " + (delta > 0 ? "up" : "down")}>
            {delta > 0 ? `▲${delta}` : `▼${-delta}`}
          </span>
        )}{" "}
        · {message}
      </p>

      <div className="wr-recent">
        <div className="sub" style={{ marginBottom: 12 }}>
          최근 7일
        </div>
        <div className="week">
          {recent.map((d, i) => (
            <div className="day" key={d.key}>
              <div className={"dot" + (d.done ? " done" : "") + (i === 6 ? " today" : "")}>
                {d.done ? "✓" : d.date.getDate()}
              </div>
              {DOW[d.date.getDay()]}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
