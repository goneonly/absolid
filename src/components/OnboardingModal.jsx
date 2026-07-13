import { useState } from "react";

// 가입 완료 후 첫 진입 시 1회 보여주는 기능 소개 팝업
const SLIDES = [
  {
    title: "매일 운동 시작",
    desc: "Day 1~30 영상으로 매일 운동하고 streak을 쌓아요. 영상을 끝까지 보면 자동으로 완료 처리돼요.",
    art: (
      <svg viewBox="0 0 84 56" aria-hidden="true">
        <rect x="4" y="4" width="76" height="40" rx="6" fill="var(--surface-2)" stroke="var(--border)" />
        <circle cx="42" cy="24" r="10" fill="var(--red)" />
        <path d="M39 19.5 L48 24 L39 28.5 Z" fill="#fff" />
        <rect x="10" y="48" width="30" height="4" rx="2" fill="var(--gray-dot)" />
      </svg>
    ),
  },
  {
    title: "그룹으로 함께",
    desc: "초대 코드로 친구들과 그룹을 만들고, 서로의 운동 현황을 매일 확인하며 함께 꾸준해져요.",
    art: (
      <svg viewBox="0 0 84 56" aria-hidden="true">
        <rect x="4" y="4" width="76" height="48" rx="6" fill="var(--surface-2)" stroke="var(--border)" />
        <circle cx="16" cy="16" r="6" fill="var(--red)" />
        <rect x="26" y="12" width="34" height="4" rx="2" fill="var(--gray-dot)" />
        <circle cx="16" cy="32" r="6" fill="var(--gray-dot)" />
        <rect x="26" y="28" width="26" height="4" rx="2" fill="var(--gray-dot)" />
        <circle cx="16" cy="46" r="6" fill="var(--red)" />
        <rect x="26" y="44" width="30" height="4" rx="2" fill="var(--gray-dot)" />
      </svg>
    ),
  },
  {
    title: "인증샷 공유",
    desc: "운동 완료 후 인증샷을 올리면 그룹의 '오늘의 인증샷'에 공유돼요. 프로필 사진도 꾸며보세요.",
    art: (
      <svg viewBox="0 0 84 56" aria-hidden="true">
        <rect x="6" y="6" width="22" height="22" rx="4" fill="var(--red)" opacity=".85" />
        <rect x="31" y="6" width="22" height="22" rx="4" fill="var(--surface-2)" stroke="var(--border)" />
        <rect x="56" y="6" width="22" height="22" rx="4" fill="var(--surface-2)" stroke="var(--border)" />
        <rect x="6" y="31" width="22" height="22" rx="4" fill="var(--surface-2)" stroke="var(--border)" />
        <circle cx="17" cy="17" r="5" fill="#fff" opacity=".9" />
        <rect x="31" y="31" width="22" height="22" rx="4" fill="var(--gray-dot)" opacity=".5" />
      </svg>
    ),
  },
];

export default function OnboardingModal({ onClose }) {
  const [i, setI] = useState(0);
  const last = i === SLIDES.length - 1;
  const slide = SLIDES[i];

  return (
    <div className="modal-backdrop">
      <div className="modal" role="dialog" aria-modal="true" aria-label="AbsDay 기능 소개">
        <h3>환영해요! 🎉</h3>
        <p className="sub">AbsDay에서 이런 걸 할 수 있어요</p>

        <div className="onb-art">{slide.art}</div>
        <strong className="onb-title">{slide.title}</strong>
        <p className="onb-desc">{slide.desc}</p>

        <div className="onb-footer">
          <div className="onb-dots" aria-label={`${i + 1} / ${SLIDES.length}`}>
            {SLIDES.map((_, d) => (
              <i key={d} className={d === i ? "on" : ""} />
            ))}
          </div>
          {last ? (
            <button className="onb-btn primary" onClick={onClose}>
              확인
            </button>
          ) : (
            <button className="onb-btn" onClick={() => setI(i + 1)}>
              다음
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
