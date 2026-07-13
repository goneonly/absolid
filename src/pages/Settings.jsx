import { useState } from 'react'
import { getProfile, saveProfile, clearRecords, getRecords, todayKey } from '../storage.js'
import { supabase } from '../supabase.js'
import { signUp, signIn, signOut, saveNickname } from '../auth.js'

export default function Settings({ session, onChanged }) {
  const [nickname, setNickname] = useState(getProfile().nickname)
  const [saved, setSaved] = useState(false)

  async function save() {
    saveProfile({ nickname: nickname.trim() })
    if (session) await saveNickname(nickname.trim())
    setSaved(true)
    setTimeout(() => setSaved(false), 1500)
    onChanged()
  }

  // 기록을 CSV로 내려받기 — 구글시트에서 파일 > 가져오기로 바로 열 수 있어요 (Day 6)
  function exportCSV() {
    const records = getRecords()
    const rows = [['날짜', 'Day', '완료 시각', '사진']]
    for (const k of Object.keys(records).sort()) {
      const r = records[k]
      if (r.completed) rows.push([k, r.day || '', r.completedAt || '', r.photoUrl || ''])
    }
    const csv = '﻿' + rows.map(r => r.join(',')).join('\r\n') // BOM: 엑셀/시트 한글 깨짐 방지
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    a.download = `absday-records-${todayKey()}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  function reset() {
    if (confirm('이 기기의 운동 기록을 삭제할까요? 되돌릴 수 없어요.')) {
      clearRecords()
      onChanged()
    }
  }

  return (
    <main className="page">
      <h2>설정</h2>
      <p className="sub">
        {session ? `${session.user.email} 계정으로 이용 중이에요.` : '지금은 비회원(기기 저장) 모드예요.'}
      </p>

      <section className="card">
        <div style={{ fontWeight: 700, fontSize: 15 }}>내 프로필</div>
        <div className="field">
          <label htmlFor="nick">닉네임</label>
          <input id="nick" value={nickname} placeholder="그룹에 표시될 이름"
            maxLength={12} onChange={e => setNickname(e.target.value)} />
        </div>
        <button className="cta secondary" style={{ marginTop: 14 }} onClick={save}>
          {saved ? '저장됐어요 ✓' : '저장'}
        </button>
      </section>

      <AccountCard session={session} nickname={nickname} />

      <section className="card">
        <button className="row-btn" onClick={exportCSV}>
          기록 내보내기 (CSV) <span className="hint">구글시트에서 열기 가능</span>
        </button>
        <button className="row-btn danger" onClick={reset}>운동 기록 초기화 (이 기기)</button>
      </section>

      <p className="sub" style={{ marginTop: 16, textAlign: 'center' }}>AbsDay v1.0</p>
    </main>
  )
}

function AccountCard({ session, nickname }) {
  const [mode, setMode] = useState('signin') // signin | signup
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')

  if (!supabase) {
    return (
      <section className="card">
        <div style={{ fontWeight: 700, fontSize: 15 }}>계정</div>
        <p className="sub" style={{ marginTop: 6 }}>
          서버(Supabase) 연결 대기 중이에요. 프로젝트 키를 연결하면 로그인·회원가입이 열립니다.
          연결 방법은 SUPABASE_SETUP.md 문서를 참고해 주세요.
        </p>
      </section>
    )
  }

  if (session) {
    return (
      <section className="card">
        <div style={{ fontWeight: 700, fontSize: 15 }}>계정</div>
        <p className="sub" style={{ marginTop: 6 }}>{session.user.email}</p>
        <p className="sub" style={{ marginTop: 4 }}>기록이 계정에 안전하게 저장돼요. 어느 기기서든 이어갈 수 있어요.</p>
        <button className="cta secondary" style={{ marginTop: 14 }} onClick={() => signOut()}>
          로그아웃
        </button>
      </section>
    )
  }

  async function submit(e) {
    e.preventDefault()
    setError(''); setNotice(''); setBusy(true)
    const fn = mode === 'signup'
      ? () => signUp(email, password, nickname, fullName.trim(), phone.trim())
      : () => signIn(email, password)
    const res = await fn()
    setBusy(false)
    if (res?.error) { setError(res.error); return }
    if (mode === 'signup' && !res?.data?.session) {
      setNotice('가입 확인 메일을 보냈어요. 메일함에서 인증 후 로그인해 주세요.')
    }
  }

  return (
    <section className="card">
      <div style={{ fontWeight: 700, fontSize: 15 }}>
        {mode === 'signup' ? '회원가입' : '로그인'}
      </div>
      <p className="sub" style={{ marginTop: 6 }}>
        회원이 되면 기록이 계정에 저장되고, 그룹 만들기·사진 업로드를 쓸 수 있어요.
      </p>
      <form onSubmit={submit}>
        {mode === 'signup' && (
          <>
            <div className="field">
              <label htmlFor="name">이름</label>
              <input id="name" required value={fullName} maxLength={20}
                autoComplete="name" onChange={e => setFullName(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="phone">전화번호</label>
              <input id="phone" type="tel" required value={phone} maxLength={13}
                placeholder="010-0000-0000" autoComplete="tel"
                onChange={e => setPhone(e.target.value)} />
            </div>
          </>
        )}
        <div className="field">
          <label htmlFor="email">이메일</label>
          <input id="email" type="email" required value={email}
            autoComplete="email" onChange={e => setEmail(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="pw">비밀번호 (6자 이상)</label>
          <input id="pw" type="password" required minLength={6} value={password}
            autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
            onChange={e => setPassword(e.target.value)} />
        </div>
        {error && <p className="sub" style={{ color: 'var(--red)', marginTop: 10 }}>{error}</p>}
        {notice && <p className="sub" style={{ marginTop: 10 }}>{notice}</p>}
        <button className="cta" type="submit" disabled={busy} style={{ marginTop: 14 }}>
          {busy ? '처리 중…' : mode === 'signup' ? '가입하기' : '로그인'}
        </button>
      </form>
      <button className="cta secondary" style={{ marginTop: 10 }}
        onClick={() => { setMode(mode === 'signup' ? 'signin' : 'signup'); setError(''); setNotice('') }}>
        {mode === 'signup' ? '이미 계정이 있어요 → 로그인' : '회원가입'}
      </button>
    </section>
  )
}
