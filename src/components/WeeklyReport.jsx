import { useMemo } from "react";
import { weeklySummary } from "../stats.js";
import { Card, CardTitle, Sub, cx } from "./ui.jsx";

const DOW = ["일", "월", "화", "수", "목", "금", "토"];

// 이번 주(월~일) 인증 요약 + 지난주 대비 + 최근 7일 현황
export default function WeeklyReport({ records }) {
  const data = useMemo(() => weeklySummary(records), [records]);

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
