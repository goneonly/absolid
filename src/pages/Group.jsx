import { useEffect, useState, useCallback } from 'react'
import { todayKey, lastNDays, getProfile } from '../storage.js'
import { supabase } from '../supabase.js'
import { fetchMyGroup, createGroup, joinGroup, leaveGroup, fetchGroupStatus } from '../api.js'
import { submitReport } from '../admin.js'
import { toast } from '../toast.js'

const WEEK = ['일', '월', '화', '수', '목', '금', '토']

function MemberRow({ name, isMe, dates, avatar }) {
  const days = lastNDays(7, {})
  const doneToday = dates.has(todayKey())
  return (
    <div className="member" style={{ alignItems: 'flex-start' }}>
      <span className={'member-avatar' + (doneToday ? ' done' : '')} style={{ marginTop: 2 }}>
        {avatar ? (
          <img src={avatar} alt={`${name} 프로필 사진`} loading="lazy" />
        ) : (
          <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M12 12a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9Zm0 2c-4.2 0-8 2.2-8 5.4V21h16v-1.6c0-3.2-3.8-5.4-8-5.4Z" />
          </svg>
        )}
      </span>
      <div style={{ flex: 1 }}>
        <span className="name">{name}{isMe ? ' (나)' : ''}</span>
        <div style={{ display: 'flex', gap: 5, marginTop: 6 }}>
          {days.map(d => (
            <div key={d.key} style={{ textAlign: 'center' }}>
              <div style={{
                width: 16, height: 16, borderRadius: '50%',
                background: dates.has(d.key) ? 'var(--red)' : 'var(--gray-dot)',
              }} />
              <div style={{ fontSize: 9, color: 'var(--text-dim)', marginTop: 2 }}>{WEEK[d.date.getDay()]}</div>
            </div>
          ))}
        </div>
      </div>
      <span className={'state-label' + (doneToday ? ' done' : '')}>{doneToday ? '오늘 완료' : '아직'}</span>
    </div>
  )
}

export default function Group({ records, session }) {
  const [group, setGroup] = useState(null)
  const [members, setMembers] = useState([])
  const [photos, setPhotos] = useState([])
  const [loading, setLoading] = useState(true)
  const [mode, setMode] = useState('join') // join | create
  const [input, setInput] = useState('')
  const [maxMembers, setMaxMembers] = useState(10)
  const [membersOnly, setMembersOnly] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)

  const load = useCallback(async () => {
    if (!supabase || !session) { setLoading(false); return }
    setLoading(true)
    try {
      const g = await fetchMyGroup()
      setGroup(g)
      if (g) {
        const { members, photos } = await fetchGroupStatus(g.id)
        setMembers(members)
        setPhotos(photos)
      }
    } catch { /* 네트워크 오류 시 조용히 패스 */ }
    setLoading(false)
  }, [session])

  useEffect(() => { load() }, [load])

  async function submit() {
    setError(''); setBusy(true)
    try {
      const nickname = getProfile().nickname
      if (mode === 'create') {
        await createGroup(input.trim() || '우리 복근단', nickname, { maxMembers, membersOnly })
      } else {
        await joinGroup(input, nickname)
      }
      setInput('')
      await load()
    } catch (e) { setError(e.message) }
    setBusy(false)
  }

  async function onLeave() {
    if (!confirm('그룹에서 나갈까요? 내 운동 기록은 사라지지 않아요.')) return
    setBusy(true)
    await leaveGroup(group.id)
    setGroup(null); setMembers([]); setPhotos([])
    setBusy(false)
  }

  async function reportPhoto(p) {
    const reason = prompt(`${p.name}의 인증샷을 신고할까요?\n사유를 입력해 주세요. (선택)`)
    if (reason === null) return // 취소
    try {
      await submitReport(p.id, todayKey(), reason)
      toast('신고가 접수됐어요. 관리자가 확인 후 처리할게요.')
    } catch (e) { toast(e.message) }
  }

  function copyCode() {
    navigator.clipboard?.writeText(group.invite_code).then(() => {
      setCopied(true); setTimeout(() => setCopied(false), 1500)
    })
  }

  // 나(내 기록)는 항상 로컬 기록 기준으로도 표시
  const myDates = new Set(lastNDays(7, records).filter(d => d.done).map(d => d.key))
  const myName = getProfile().nickname || '나'
  const myId = session?.user?.id

  // 오늘의 인증샷: 서버 사진 + (서버에 아직 없으면) 내 로컬 사진 보충
  const myLocalPhoto = records[todayKey()]?.photo
  const todayPhotos = [...photos]
  if (myId && myLocalPhoto && !todayPhotos.some(p => p.id === myId)) {
    todayPhotos.unshift({ id: myId, name: myName, url: myLocalPhoto })
  }

  // ── 미로그인/서버 미연결 ──
  if (!supabase || !session) {
    return (
      <main className="page">
        <h2>그룹</h2>
        <section className="card">
          <MemberRow name={myName} isMe dates={myDates} />
        </section>
        <section className="card locked-card">
          <div className="lock-bg" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <rect x="4.5" y="10.5" width="15" height="10" rx="2.5" />
              <path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" />
              <circle cx="12" cy="15.5" r="1.4" fill="currentColor" stroke="none" />
            </svg>
          </div>
          <div className="locked-text">
            <strong>그룹은 로그인 후 이용할 수 있어요</strong>
            <p className="sub" style={{ marginTop: 8 }}>
              설정 탭에서 로그인/회원가입을 하면<br />초대 코드로 친구들과 함께할 수 있어요.
            </p>
          </div>
        </section>
      </main>
    )
  }

  if (loading) return <main className="page"><h2>그룹</h2><p className="sub">불러오는 중…</p></main>

  // ── 그룹 없음: 참여/생성 ──
  if (!group) {
    return (
      <main className="page">
        <h2>그룹</h2>
        <p className="sub">초대 코드로 참여하거나 새 그룹을 만들어 보세요.</p>
        <section className="card">
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            <button className={'cta secondary'} style={{ flex: 1, opacity: mode === 'join' ? 1 : .5 }} onClick={() => { setMode('join'); setError('') }}>초대 코드로 참여</button>
            <button className={'cta secondary'} style={{ flex: 1, opacity: mode === 'create' ? 1 : .5 }} onClick={() => { setMode('create'); setError('') }}>그룹 만들기</button>
          </div>
          <input
            className="input"
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder={mode === 'join' ? '초대 코드 6자리 (예: AB3K7Q)' : '그룹 이름 (예: 우리 복근단)'}
            maxLength={mode === 'join' ? 6 : 20}
            style={mode === 'join' ? { textTransform: 'uppercase', letterSpacing: 2 } : undefined}
          />
          {mode === 'create' && (
            <div className="group-options">
              <div className="option-row">
                <label htmlFor="max-members">인원수 제한</label>
                <select id="max-members" className="option-select" value={maxMembers}
                  onChange={e => setMaxMembers(Number(e.target.value))}>
                  {[2, 3, 4, 5, 6, 8, 10, 15, 20, 30, 50].map(n => (
                    <option key={n} value={n}>{n}명</option>
                  ))}
                </select>
              </div>
              <label className="option-row checkbox">
                <span>
                  회원만 받기
                  <small>이름·전화번호를 등록한 회원만 참여할 수 있어요</small>
                </span>
                <input type="checkbox" checked={membersOnly}
                  onChange={e => setMembersOnly(e.target.checked)} />
              </label>
            </div>
          )}
          {error && <p className="sub" style={{ color: 'var(--red)', marginTop: 8 }}>{error}</p>}
          <button className="cta" onClick={submit} disabled={busy || !input.trim()} style={{ marginTop: 12 }}>
            {busy ? '처리 중…' : mode === 'join' ? '참여하기' : '만들기'}
          </button>
        </section>
      </main>
    )
  }

  // ── 그룹 있음: 멤버 현황 ──
  return (
    <main className="page">
      <h2>그룹</h2>

      <section className="card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontWeight: 700, fontSize: 15 }}>{group.name}</div>
          <button className="linklike" onClick={copyCode}>
            초대 코드 <strong style={{ letterSpacing: 1 }}>{group.invite_code}</strong> {copied ? '✓ 복사됨' : '복사'}
          </button>
        </div>
        <div style={{ marginTop: 8 }}>
          {members.map(m => (
            <MemberRow
              key={m.id}
              name={m.id === myId ? (myName || m.name) : m.name}
              isMe={m.id === myId}
              avatar={m.id === myId ? (getProfile().avatar || m.avatar) : m.avatar}
              dates={m.id === myId ? new Set([...m.dates, ...myDates]) : m.dates}
            />
          ))}
        </div>
        <div className="legend">
          <span><i style={{ background: 'var(--red)' }} />운동 함</span>
          <span><i style={{ background: 'var(--gray-dot)' }} />아직 안 함</span>
        </div>
      </section>

      <section className="card">
        <div style={{ fontWeight: 700, fontSize: 15 }}>오늘의 인증샷 📷</div>
        {todayPhotos.length ? (
          <div className="photo-grid">
            {todayPhotos.map(p => (
              <figure key={p.id}>
                <img className="ph" src={p.url} alt={`${p.name}의 오늘 인증샷`} loading="lazy" />
                <figcaption>
                  {p.id === myId ? (myName || p.name) : p.name}
                  {p.id !== myId && (
                    <button className="report-link" onClick={() => reportPhoto(p)} aria-label="이 사진 신고">
                      신고
                    </button>
                  )}
                </figcaption>
              </figure>
            ))}
          </div>
        ) : (
          <p className="sub" style={{ marginTop: 6 }}>아직 오늘 올라온 인증샷이 없어요. 첫 인증샷의 주인공이 되어 보세요!</p>
        )}
      </section>

      <div className="group-footer">
        <button className="icon-btn" onClick={load} disabled={busy} aria-label="새로고침" title="새로고침">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 12a9 9 0 1 1-2.64-6.36" />
            <path d="M21 3v6h-6" />
          </svg>
        </button>
        <button className="leave-btn" onClick={onLeave} disabled={busy}>그룹 나가기</button>
      </div>
    </main>
  )
}
