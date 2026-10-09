import { useMemo } from "react";
import { todayKey, computeStreak, lastNDays } from "../storage.js";
import { Card, CardTitle, Sub, cx } from "./ui.jsx";

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
    <Card>
      <div className="flex items-center justify-between">
        <CardTitle>주간 리포트</CardTitle>
        <span className="text-2xs text-dim">이번 주 · {range}</span>
      </div>

      <div className="mt-3.5 grid grid-cols-3 gap-2">
        <Stat value={count} unit="회" label="이번 주 인증" />
        <Stat value={streak} unit="일" label="연속 streak" />
        <Stat value={rate} unit="%" label="이번 주 달성률" />
      </div>

      <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-surface-2" aria-hidden="true">
        <i className="block h-full rounded-full bg-brand transition-[width] duration-300" style={{ width: `${Math.min(100, rate)}%` }} />
      </div>

      <Sub className="mt-2.5">
        지난주 {lastCount}회
        {delta !== 0 && (
          <span className={cx("ml-1.5 text-2xs font-bold", delta > 0 ? "text-success" : "text-dim")}>
            {delta > 0 ? `▲${delta}` : `▼${-delta}`}
          </span>
        )}{" "}
        · {message}
      </Sub>

      <div className="mt-4.5 border-t border-line pt-4">
        <Sub className="mb-3">최근 7일</Sub>
        <div className="flex justify-between">
          {recent.map((d, i) => (
            <div className="flex flex-col items-center gap-2 text-xs text-dim" key={d.key}>
              <div
                className={cx(
                  "flex size-7 items-center justify-center rounded-full text-sm",
                  d.done ? "bg-brand font-bold text-white" : "bg-dot",
                  i === 6 && "outline-2 outline-offset-2 outline-brand",
                )}
              >
                {d.done ? "✓" : d.date.getDate()}
              </div>
              {DOW[d.date.getDay()]}
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}

function Stat({ value, unit, label }) {
  return (
    <div className="rounded-md border border-line bg-surface-2 px-1.5 py-3 text-center text-2xs text-dim">
      <b className="mb-1 block text-2xl font-extrabold text-fg">
        {value}
        <span className="ml-px text-xs font-semibold text-dim">{unit}</span>
      </b>
      {label}
    </div>
  );
}
