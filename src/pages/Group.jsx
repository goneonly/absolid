import { useEffect, useState, useCallback } from 'react'
import { todayKey, lastNDays, getProfile } from '../storage.js'
import { supabase } from '../supabase.js'
import { fetchMyGroup, createGroup, joinGroup, leaveGroup, fetchGroupStatus } from '../api.js'
import { submitReport } from '../admin.js'
import { toast } from '../toast.js'
import Leaderboard from '../components/Leaderboard.jsx'
import { Button, Card, CardTitle, Input, LinkButton, MemberAvatar, Page, PageTitle, Sub, cx } from '../components/ui.jsx'

const WEEK = ['일', '월', '화', '수', '목', '금', '토']
const OPTION_ROW = 'flex items-center justify-between gap-3 border-b border-line py-3 text-base last:border-b-0'

function MemberRow({ name, isMe, dates, avatar }) {
  const days = lastNDays(7, {})
  const doneToday = dates.has(todayKey())
  return (
    <div className="flex items-start gap-3 border-b border-line py-3 last:border-b-0">
      <MemberAvatar name={name} avatar={avatar} active={doneToday} className="mt-0.5" />
      <div className="flex-1">
        <span className="text-md font-semibold">{name}{isMe ? ' (나)' : ''}</span>
        <div className="mt-1.5 flex gap-1.5">
          {days.map(d => (
            <div key={d.key} className="text-center">
              <div className={cx('size-4 rounded-full', dates.has(d.key) ? 'bg-brand' : 'bg-dot')} />
              <div className="mt-0.5 text-2xs text-dim">{WEEK[d.date.getDay()]}</div>
            </div>
          ))}
        </div>
      </div>
      <span className={cx('text-xs', doneToday ? 'font-semibold text-brand' : 'text-dim')}>
        {doneToday ? '오늘 완료' : '아직'}
      </span>
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
  const [maxMembers, setMaxMembers] = useState('10')
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
    setError('')
    const limit = Number(maxMembers)
    if (mode === 'create' && !(limit >= 2 && limit <= 50)) {
      setError('인원수는 2~50명 사이로 입력해 주세요.')
      return
    }
    setBusy(true)
    try {
      const nickname = getProfile().nickname
      if (mode === 'create') {
        await createGroup(input.trim() || '우리 복근단', nickname, { maxMembers: limit, membersOnly })
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
      <Page>
        <PageTitle>그룹</PageTitle>
        <Card>
          <MemberRow name={myName} isMe dates={myDates} />
        </Card>
        <Card className="relative overflow-hidden border-brand/30 bg-brand/15 px-5 py-8.5 text-center">
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center" aria-hidden="true">
            <svg className="size-21 text-dot opacity-55" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <rect x="4.5" y="10.5" width="15" height="10" rx="2.5" />
              <path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" />
              <circle cx="12" cy="15.5" r="1.4" fill="currentColor" stroke="none" />
            </svg>
          </div>
          <div className="relative z-1">
            <strong className="text-md">그룹은 로그인 후 이용할 수 있어요</strong>
            <Sub className="mt-2">
              설정 탭에서 로그인/회원가입을 하면<br />초대 코드로 친구들과 함께할 수 있어요.
            </Sub>
          </div>
        </Card>
      </Page>
    )
  }

  if (loading) return <Page><PageTitle>그룹</PageTitle><Sub>불러오는 중…</Sub></Page>

  // ── 그룹 없음: 참여/생성 ──
  if (!group) {
    return (
      <Page>
        <PageTitle>그룹</PageTitle>
        <Sub>초대 코드로 참여하거나 새 그룹을 만들어 보세요.</Sub>
        <Card>
          <div className="mb-3 flex gap-2">
            <Button variant="secondary" className={cx('flex-1', mode !== 'join' && 'opacity-50')} onClick={() => { setMode('join'); setError('') }}>초대 코드로 참여</Button>
            <Button variant="secondary" className={cx('flex-1', mode !== 'create' && 'opacity-50')} onClick={() => { setMode('create'); setError('') }}>그룹 만들기</Button>
          </div>
          <Input
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder={mode === 'join' ? '초대 코드 6자리 (예: AB3K7Q)' : '그룹 이름 (예: 중앙대학교)'}
            maxLength={mode === 'join' ? 6 : 20}
            className={mode === 'join' ? 'uppercase tracking-widest' : undefined}
          />
          {mode === 'create' && (
            <div className="mt-3 border-t border-line">
              <div className={OPTION_ROW}>
                <label htmlFor="max-members">인원수 제한</label>
                <span className="flex items-center gap-1.5 text-dim">
                  <Input id="max-members" className="w-16 px-3 py-2 text-center text-base" type="text" inputMode="numeric"
                    value={maxMembers} placeholder="2~50" maxLength={2}
                    onChange={e => { setMaxMembers(e.target.value.replace(/\D/g, '')); setError('') }} />
                  명
                </span>
              </div>
              <label className={cx(OPTION_ROW, 'cursor-pointer')}>
                <span className="flex flex-col gap-0.5">
                  회원만 받기
                  <small className="text-2xs text-dim">이름·전화번호를 등록한 회원만 참여할 수 있어요</small>
                </span>
                <input type="checkbox" className="size-4.5 flex-none accent-brand" checked={membersOnly}
                  onChange={e => setMembersOnly(e.target.checked)} />
              </label>
            </div>
          )}
          {error && <Sub className="mt-2 text-brand">{error}</Sub>}
          <Button className="mt-3" onClick={submit} disabled={busy || !input.trim()}>
            {busy ? '처리 중…' : mode === 'join' ? '참여하기' : '만들기'}
          </Button>
        </Card>
      </Page>
    )
  }

  // ── 그룹 있음: 멤버 현황 ──
  return (
    <Page>
      <PageTitle>그룹</PageTitle>

      <Card>
        <div className="flex items-center justify-between">
          <CardTitle>{group.name}</CardTitle>
          <LinkButton onClick={copyCode}>
            초대 코드 <strong className="text-sm tracking-wider text-brand">{group.invite_code}</strong> {copied ? '✓ 복사됨' : '복사'}
          </LinkButton>
        </div>
        <div className="mt-2">
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
        <div className="mt-3 flex items-center gap-4 text-xs text-dim">
          <span><i className="mr-1.5 inline-block size-2.5 rounded-full bg-brand" />운동 함</span>
          <span><i className="mr-1.5 inline-block size-2.5 rounded-full bg-dot" />아직 안 함</span>
        </div>
      </Card>

      <Leaderboard members={members} myId={myId} myName={myName} records={records} />

      <Card>
        <CardTitle>오늘의 인증샷 📷</CardTitle>
        {todayPhotos.length ? (
          <div className="mt-3.5 grid max-h-87 grid-cols-3 gap-2 overflow-y-auto overscroll-contain">
            {todayPhotos.map(p => (
              <figure key={p.id}>
                <img className="aspect-square w-full rounded-md border border-line bg-surface-2 object-cover" src={p.url} alt={`${p.name}의 오늘 인증샷`} loading="lazy" />
                <figcaption className="mt-1 truncate text-center text-2xs text-dim">
                  {p.id === myId ? (myName || p.name) : p.name}
                  {p.id !== myId && (
                    <button className="ml-1.5 text-2xs text-dim underline" onClick={() => reportPhoto(p)} aria-label="이 사진 신고">
                      신고
                    </button>
                  )}
                </figcaption>
              </figure>
            ))}
          </div>
        ) : (
          <Sub className="mt-1.5">아직 오늘 올라온 인증샷이 없어요. 첫 인증샷의 주인공이 되어 보세요!</Sub>
        )}
      </Card>

      <div className="mt-3.5 flex items-center justify-between px-1">
        <button
          className="flex size-8.5 items-center justify-center rounded-full border border-line bg-surface-2 text-dim active:scale-[.94] disabled:opacity-50"
          onClick={load} disabled={busy} aria-label="새로고침" title="새로고침"
        >
          <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 12a9 9 0 1 1-2.64-6.36" />
            <path d="M21 3v6h-6" />
          </svg>
        </button>
        <LinkButton className="px-1 py-2 underline" onClick={onLeave} disabled={busy}>그룹 나가기</LinkButton>
      </div>
    </Page>
  )
}
