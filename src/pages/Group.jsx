import { useEffect, useState, useCallback } from 'react'
import { todayKey, lastNDays, getProfile } from '../storage.js'
import { supabase } from '../supabase.js'
import { fetchMyGroup, createGroup, joinGroup, leaveGroup, fetchGroupStatus } from '../api.js'

const WEEK = ['일', '월', '화', '수', '목', '금', '토']

function MemberRow({ name, isMe, dates }) {
  const days = lastNDays(7, {})
  const doneToday = dates.has(todayKey())
  return (
    <div className="member" style={{ alignItems: 'flex-start' }}>
      <span className={'status' + (doneToday ? ' done' : '')} style={{ marginTop: 4 }} />
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
  const [loading, setLoading] = useState(true)
  const [mode, setMode] = useState('join') // join | create
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)

  const load = useCallback(async () => {
    if (!supabase || !session) { setLoading(false); return }
    setLoading(true)
    try {
      const g = await fetchMyGroup()
      setGroup(g)
      if (g) setMembers(await fetchGroupStatus(g.id))
    } catch { /* 네트워크 오류 시 조용히 패스 */ }
    setLoading(false)
  }, [session])

  useEffect(() => { load() }, [load])

  async function submit() {
    setError(''); setBusy(true)
    try {
      const nickname = getProfile().nickname
      if (mode === 'create') await createGroup(input.trim() || '우리 복근단', nickname)
      else await joinGroup(input, nickname)
      setInput('')
      await load()
    } catch (e) { setError(e.message) }
    setBusy(false)
  }

  async function onLeave() {
    if (!confirm('그룹에서 나갈까요? 내 운동 기록은 사라지지 않아요.')) return
    setBusy(true)
    await leaveGroup(group.id)
    setGroup(null); setMembers([])
    setBusy(false)
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

  // ── 미로그인/서버 미연결 ──
  if (!supabase || !session) {
    return (
      <main className="page">
        <h2>그룹</h2>
        <p className="sub">오늘 운동한 멤버는 레드, 아직인 멤버는 그레이로 표시돼요.</p>
        <section className="card">
          <MemberRow name={myName} isMe dates={myDates} />
        </section>
        <section className="card">
          <div style={{ fontWeight: 700, fontSize: 15 }}>그룹은 로그인 후 이용할 수 있어요</div>
          <p className="sub" style={{ marginTop: 6 }}>
            설정 탭에서 로그인/회원가입을 하면 초대 코드로 친구들과 함께할 수 있어요.
          </p>
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
      <p className="sub">오늘 운동한 멤버는 레드, 아직인 멤버는 그레이로 표시돼요.</p>

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
              dates={m.id === myId ? new Set([...m.dates, ...myDates]) : m.dates}
            />
          ))}
        </div>
        <div className="legend">
          <span><i style={{ background: 'var(--red)' }} />운동 함</span>
          <span><i style={{ background: 'var(--gray-dot)' }} />아직 안 함</span>
        </div>
      </section>

      <section className="card" style={{ display: 'flex', gap: 8 }}>
        <button className="cta secondary" style={{ flex: 1 }} onClick={load} disabled={busy}>새로고침</button>
        <button className="cta secondary" style={{ flex: 1, color: 'var(--red)' }} onClick={onLeave} disabled={busy}>그룹 나가기</button>
      </section>
    </main>
  )
}
