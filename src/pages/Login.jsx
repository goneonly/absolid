import { useState } from 'react'
import { signIn, signUp, sendPasswordReset } from '../auth.js'
import { getProfile, markOnboardingPending, cancelOnboarding } from '../storage.js'
import {
  validateEmail, validateName, validatePhone, formatPhone, validatePassword,
} from '../validation.js'
import PrivacyModal from '../components/PrivacyModal.jsx'
import { Button, Field, FieldError, LinkButton, Logo, Sub } from '../components/ui.jsx'

// 앱 첫 화면 — 로그인 / 회원가입 / 비회원으로 시작
// 로그인(또는 즉시 세션이 생기는 가입)에 성공하면 onDone → App이 메인 화면으로 전환
export default function Login({ onDone, onGuest }) {
  const [mode, setMode] = useState('signin') // signin | signup
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')
  const [agreed, setAgreed] = useState(false)
  const [fieldErrors, setFieldErrors] = useState({})
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [resetBusy, setResetBusy] = useState(false)
  const [showPrivacy, setShowPrivacy] = useState(false)
  const signup = mode === 'signup'

  function clearFieldError(key) {
    setFieldErrors((p) => ({ ...p, [key]: '' }))
  }

  function switchMode() {
    setMode(signup ? 'signin' : 'signup')
    setError('')
    setNotice('')
    setFieldErrors({})
    setAgreed(false)
  }

  // 필드별 엄격 검증 — 통과 못 하면 제출 자체를 막음
  function validateAll() {
    const errs = { email: validateEmail(email) }
    if (signup) {
      errs.fullName = validateName(fullName)
      errs.phone = validatePhone(phone)
      errs.password = validatePassword(password)
      errs.agreed = agreed ? '' : '개인정보 수집·이용에 동의해 주세요.'
    } else {
      errs.password = password ? '' : '비밀번호를 입력해 주세요.'
    }
    setFieldErrors(errs)
    return !Object.values(errs).some(Boolean)
  }

  async function submit(e) {
    e.preventDefault()
    setError('')
    setNotice('')
    if (!validateAll()) return
    setBusy(true)
    if (!signup) {
      const res = await signIn(email.trim(), password)
      setBusy(false)
      if (res?.error) setError(res.error)
      else onDone()
      return
    }
    // 온보딩 플래그는 가입 요청 "전"에 저장해야 함 —
    // 가입 성공 시 세션 발급(App의 팝업 체크)이 응답보다 먼저 일어나기 때문
    markOnboardingPending()
    const res = await signUp(email.trim(), password, getProfile().nickname, fullName.trim(), formatPhone(phone))
    setBusy(false)
    if (res?.error) {
      cancelOnboarding() // 가입 실패 시 롤백
      setError(res.error)
      return
    }
    if (res?.data?.session) {
      onDone()
    } else {
      // 이메일 인증이 필요한 경우: 로그인 모드로 돌려 인증 후 바로 로그인할 수 있게
      setMode('signin')
      setPassword('')
      setNotice('가입 확인 메일을 보냈어요. 메일함에서 인증한 뒤 로그인해 주세요.')
    }
  }

  async function forgotPassword() {
    setError('')
    setNotice('')
    const emailErr = validateEmail(email)
    if (emailErr) {
      setFieldErrors((p) => ({ ...p, email: emailErr }))
      return
    }
    setResetBusy(true)
    const res = await sendPasswordReset(email.trim())
    setResetBusy(false)
    if (res?.error) setError(res.error)
    else setNotice('비밀번호 재설정 메일을 보냈어요. 메일의 링크를 열면 새 비밀번호를 정할 수 있어요.')
  }

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-5 py-10">
      <Logo size={48} className="justify-center gap-3 text-3xl" />
      <Sub className="mt-2 text-center">매일 복근, 같이</Sub>

      <form className="mt-8 w-full rounded-2xl border border-line bg-surface px-5 pt-6 pb-5" onSubmit={submit} noValidate>
        <h2 className="text-xl font-bold">{signup ? '회원가입' : '로그인'}</h2>
        {signup && (
          <>
            <Field
              id="name"
              label="이름"
              value={fullName}
              maxLength={20}
              placeholder="홍길동"
              autoComplete="name"
              error={fieldErrors.fullName}
              onBlur={() => setFieldErrors((p) => ({ ...p, fullName: fullName ? validateName(fullName) : '' }))}
              onChange={(e) => {
                setFullName(e.target.value)
                clearFieldError('fullName')
              }}
            />
            <Field
              id="phone"
              label="전화번호"
              type="tel"
              value={phone}
              maxLength={13}
              placeholder="010-0000-0000"
              autoComplete="tel"
              inputMode="numeric"
              error={fieldErrors.phone}
              onBlur={() => setFieldErrors((p) => ({ ...p, phone: phone ? validatePhone(phone) : '' }))}
              onChange={(e) => {
                setPhone(formatPhone(e.target.value))
                clearFieldError('phone')
              }}
            />
          </>
        )}
        <Field
          id="login-email"
          label="이메일"
          type="email"
          value={email}
          placeholder="name@example.com"
          autoComplete="email"
          error={fieldErrors.email}
          onChange={(e) => {
            setEmail(e.target.value)
            clearFieldError('email')
          }}
        />
        <Field
          id="login-pw"
          label={signup ? '비밀번호 (6자 이상, 영문+숫자)' : '비밀번호'}
          type="password"
          value={password}
          autoComplete={signup ? 'new-password' : 'current-password'}
          error={fieldErrors.password}
          onBlur={() => signup && setFieldErrors((p) => ({ ...p, password: password ? validatePassword(password) : '' }))}
          onChange={(e) => {
            setPassword(e.target.value)
            clearFieldError('password')
          }}
        />

        {!signup && (
          <LinkButton type="button" className="mt-2.5 underline" disabled={resetBusy} onClick={forgotPassword}>
            {resetBusy ? '메일 보내는 중…' : '비밀번호를 잊으셨나요?'}
          </LinkButton>
        )}
        {signup && (
          <div className="mt-4 rounded-md border border-line bg-surface-2 px-3.5 py-3">
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="size-4 flex-none accent-brand"
                checked={agreed}
                onChange={(e) => {
                  setAgreed(e.target.checked)
                  clearFieldError('agreed')
                }}
              />
              <span>개인정보 수집 및 이용에 동의합니다. (필수)</span>
            </label>
            <LinkButton type="button" className="mt-1.5 underline" onClick={() => setShowPrivacy(true)}>
              자세히 보기
            </LinkButton>
            {fieldErrors.agreed && <FieldError>{fieldErrors.agreed}</FieldError>}
          </div>
        )}

        {error && <Sub className="mt-2.5 text-brand">{error}</Sub>}
        {notice && <Sub className="mt-2.5">{notice}</Sub>}

        <Button type="submit" className="mt-5" disabled={busy}>
          {busy ? '처리 중…' : signup ? '가입하기' : '로그인하기'}
        </Button>
        <LinkButton type="button" className="mx-auto mt-3.5 block px-2 py-1 text-md" onClick={switchMode}>
          {signup ? '이미 계정이 있나요?' : '계정이 없나요?'}{' '}
          <span className="underline">{signup ? '로그인' : '회원가입'}</span>
        </LinkButton>
      </form>

      <LinkButton className="mt-5 px-2 py-1 underline" onClick={onGuest}>
        비회원으로 시작하기
      </LinkButton>

      {showPrivacy && <PrivacyModal onClose={() => setShowPrivacy(false)} />}
    </main>
  )
}
