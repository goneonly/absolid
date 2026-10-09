import { useState } from "react";
import { Modal, ModalText, ModalTitle, cx } from "./ui.jsx";

const ONB_BTN = "rounded-md border px-5.5 py-2.75 text-base font-bold active:scale-[.97]";

// 가입 완료 후 첫 진입 시 1회 보여주는 기능 소개 팝업
const SLIDES = [
  {
    title: "매일 운동 시작",
    desc: "Day 1~30 영상으로 매일 운동하고 streak을 쌓아요. 영상을 끝까지 보면 자동으로 완료 처리돼요.",
    art: (
      <svg viewBox="0 0 84 56" aria-hidden="true">
        <rect x="4" y="4" width="76" height="40" rx="6" fill="var(--color-surface-2)" stroke="var(--color-line)" />
        <circle cx="42" cy="24" r="10" fill="var(--color-brand)" />
        <path d="M39 19.5 L48 24 L39 28.5 Z" fill="#fff" />
        <rect x="10" y="48" width="30" height="4" rx="2" fill="var(--color-dot)" />
      </svg>
    ),
  },
  {
    title: "그룹으로 함께",
    desc: "초대 코드로 친구들과 그룹을 만들고, 서로의 운동 현황을 매일 확인하며 함께 꾸준해져요.",
    art: (
      <svg viewBox="0 0 84 56" aria-hidden="true">
        <rect x="4" y="4" width="76" height="48" rx="6" fill="var(--color-surface-2)" stroke="var(--color-line)" />
        <circle cx="16" cy="16" r="6" fill="var(--color-brand)" />
        <rect x="26" y="12" width="34" height="4" rx="2" fill="var(--color-dot)" />
        <circle cx="16" cy="32" r="6" fill="var(--color-dot)" />
        <rect x="26" y="28" width="26" height="4" rx="2" fill="var(--color-dot)" />
        <circle cx="16" cy="46" r="6" fill="var(--color-brand)" />
        <rect x="26" y="44" width="30" height="4" rx="2" fill="var(--color-dot)" />
      </svg>
    ),
  },
  {
    title: "인증샷 공유",
    desc: "운동 완료 후 인증샷을 올리면 그룹의 '오늘의 인증샷'에 공유돼요. 프로필 사진도 꾸며보세요.",
    art: (
      <svg viewBox="0 0 84 56" aria-hidden="true">
        <rect x="6" y="6" width="22" height="22" rx="4" fill="var(--color-brand)" opacity=".85" />
        <rect x="31" y="6" width="22" height="22" rx="4" fill="var(--color-surface-2)" stroke="var(--color-line)" />
        <rect x="56" y="6" width="22" height="22" rx="4" fill="var(--color-surface-2)" stroke="var(--color-line)" />
        <rect x="6" y="31" width="22" height="22" rx="4" fill="var(--color-surface-2)" stroke="var(--color-line)" />
        <circle cx="17" cy="17" r="5" fill="#fff" opacity=".9" />
        <rect x="31" y="31" width="22" height="22" rx="4" fill="var(--color-dot)" opacity=".5" />
      </svg>
    ),
  },
];

export default function OnboardingModal({ onClose }) {
  const [i, setI] = useState(0);
  const last = i === SLIDES.length - 1;
  const slide = SLIDES[i];

  return (
    <Modal label="Absolid 기능 소개">
      <ModalTitle>환영해요! 🎉</ModalTitle>
      <ModalText>Absolid에서 이런 걸 할 수 있어요</ModalText>

      <div className="mt-4.5 rounded-lg border border-line bg-bg px-7 py-4.5 [&>svg]:block [&>svg]:h-auto [&>svg]:w-full">{slide.art}</div>
      <strong className="mt-3.5 block text-center text-lg font-bold">{slide.title}</strong>
      <p className="mt-1.5 min-h-10 text-center text-sm text-dim">{slide.desc}</p>

      <div className="mt-4.5 flex items-center justify-between">
        <div className="flex gap-1.5" aria-label={`${i + 1} / ${SLIDES.length}`}>
          {SLIDES.map((_, d) => (
            <i key={d} className={cx("size-1.75 rounded-full transition-colors", d === i ? "bg-brand" : "bg-dot")} />
          ))}
        </div>
        {last ? (
          <button className={cx(ONB_BTN, "border-brand bg-brand text-white")} onClick={onClose}>
            확인
          </button>
        ) : (
          <button className={cx(ONB_BTN, "border-line bg-surface-2 text-fg")} onClick={() => setI(i + 1)}>
            다음
          </button>
        )}
      </div>
    </Modal>
  );
}
