// 공통 UI 컴포넌트 — 반복되는 Tailwind 클래스 조합을 한 곳에서 관리
import { extendTailwindMerge } from 'tailwind-merge'

// 클래스 합치기 — 뒤에 온 클래스가 같은 속성의 앞 클래스를 덮어씀
// (index.css @theme에 추가한 커스텀 폰트 크기를 알려줘야 색상 클래스와 구분됨)
export const cx = extendTailwindMerge({
  extend: { theme: { text: ['2xs', 'md', 'display'] } },
})

// ── 레이아웃 ─────────────────────────────────
export function Page({ className, ...props }) {
  return <main className={cx('flex-1 px-5 pt-2 pb-6', className)} {...props} />
}

export function PageTitle({ className, ...props }) {
  return <h2 className={cx('mb-1 text-2xl font-bold tracking-tight', className)} {...props} />
}

export function Sub({ className, ...props }) {
  return <p className={cx('text-base text-dim', className)} {...props} />
}

export function Card({ className, ...props }) {
  return <section className={cx('mt-4 rounded-xl border border-line bg-surface p-5', className)} {...props} />
}

export function CardTitle({ className, ...props }) {
  return <div className={cx('text-md font-bold', className)} {...props} />
}

// ── 버튼 ─────────────────────────────────────
const BUTTON = {
  primary: 'bg-brand text-white',
  secondary: 'bg-surface-2 text-fg',
  danger: 'bg-surface-2 text-brand',
}

export function Button({ variant = 'primary', className, ...props }) {
  return (
    <button
      className={cx(
        'w-full rounded-lg p-4 text-lg font-bold transition-transform active:scale-[.98] disabled:opacity-50 disabled:active:scale-100',
        BUTTON[variant],
        className,
      )}
      {...props}
    />
  )
}

export function MiniButton({ danger, className, ...props }) {
  return (
    <button
      className={cx(
        'flex-none rounded-sm border bg-surface-2 px-3 py-1.5 text-xs font-semibold disabled:opacity-50',
        danger ? 'border-brand/40 text-brand' : 'border-line text-fg',
        className,
      )}
      {...props}
    />
  )
}

// 설정 목록형 버튼 (왼쪽 라벨 + 오른쪽 힌트)
export function RowButton({ danger, hint, children, className, ...props }) {
  return (
    <button
      className={cx(
        'flex w-full items-center justify-between border-b border-line py-4 text-md last:border-b-0 disabled:opacity-50',
        danger && 'text-brand',
        className,
      )}
      {...props}
    >
      {children}
      {hint && <span className="text-xs text-dim">{hint}</span>}
    </button>
  )
}

export function LinkButton({ className, ...props }) {
  return <button className={cx('text-xs text-dim disabled:opacity-50', className)} {...props} />
}

// 홈 상단 공지·리마인더 배너
export function Banner({ className, ...props }) {
  return (
    <div
      className={cx('mb-3.5 rounded-md border border-brand/30 bg-brand/12 px-3.5 py-3 text-sm text-fg', className)}
      {...props}
    />
  )
}

// ── 뱃지 ─────────────────────────────────────
export function Pill({ danger, className, ...props }) {
  return (
    <span
      className={cx(
        'ml-1.5 inline-block rounded-full border bg-surface-2 px-2 py-0.5 align-middle text-2xs font-bold',
        danger ? 'border-brand/40 text-brand' : 'border-line text-dim',
        className,
      )}
      {...props}
    />
  )
}

// ── 입력 ─────────────────────────────────────
export function Input({ className, ...props }) {
  return (
    <input
      className={cx(
        'w-full rounded-md border border-line bg-surface-2 px-3.5 py-3 text-md text-fg outline-none focus:border-brand aria-invalid:border-brand',
        className,
      )}
      {...props}
    />
  )
}

export function FieldError({ children }) {
  return <p className="mt-1.5 text-xs text-brand">{children}</p>
}

// 라벨 + 입력 + 오류 메시지
export function Field({ id, label, error, className, ...inputProps }) {
  return (
    <div className={cx('mt-3.5', className)}>
      <label htmlFor={id} className="mb-1.5 block text-sm text-dim">{label}</label>
      <Input id={id} aria-invalid={!!error} {...inputProps} />
      {error && <FieldError>{error}</FieldError>}
    </div>
  )
}

// ── 바텀시트 모달 ─────────────────────────────
// onBackdrop을 넘기면 바깥 영역 탭으로 닫힘
export function Modal({ label, onBackdrop, className, children }) {
  return (
    <div className="fixed inset-0 z-100 flex items-end justify-center bg-black/70" onClick={onBackdrop}>
      <div
        className={cx(
          'w-full max-w-120 animate-sheet-up rounded-t-2xl bg-surface px-5 pt-7 pb-[calc(28px+env(safe-area-inset-bottom))]',
          className,
        )}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        onClick={onBackdrop && ((e) => e.stopPropagation())}
      >
        {children}
      </div>
    </div>
  )
}

export function ModalTitle({ className, ...props }) {
  return <h3 className={cx('text-center text-xl font-extrabold', className)} {...props} />
}

export function ModalText({ className, ...props }) {
  return <p className={cx('mt-2 text-center text-base text-dim', className)} {...props} />
}

// ── 아바타 ───────────────────────────────────
export function PersonIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 12a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9Zm0 2c-4.2 0-8 2.2-8 5.4V21h16v-1.6c0-3.2-3.8-5.4-8-5.4Z" />
    </svg>
  )
}

// 그룹·리더보드용 작은 원형 아바타 (active면 빨간 테두리)
export function MemberAvatar({ name, avatar, active, className }) {
  return (
    <span
      className={cx(
        'flex size-7.5 flex-none items-center justify-center overflow-hidden rounded-full border-2 bg-surface-2 text-dot',
        active ? 'border-brand' : 'border-dot',
        className,
      )}
    >
      {avatar ? (
        <img className="size-full object-cover" src={avatar} alt={`${name} 프로필 사진`} loading="lazy" />
      ) : (
        <PersonIcon className="size-4" />
      )}
    </span>
  )
}
