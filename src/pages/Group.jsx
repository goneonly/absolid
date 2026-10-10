import { useEffect, useState, useCallback, useRef } from 'react'
import { todayKey, lastNDays, getProfile } from '../storage.js'
import { supabase } from '../supabase.js'
import {
  fetchMyGroups, createGroup, joinGroup, leaveGroup, fetchGroupStatus,
  uploadGroupPhoto, removeGroupPhoto, sendCheer, notifyCheer, fetchTodayCheers,
} from '../api.js'
import { submitReport } from '../admin.js'
import { toast } from '../toast.js'
import { compressImage } from '../image.js'
import Leaderboard from '../components/Leaderboard.jsx'
import {
  Button, Card, CardTitle, GroupPhoto, Input, LinkButton, MemberAvatar, Modal, ModalTitle,
  Page, PageTitle, Sub, cx,
} from '../components/ui.jsx'

const WEEK = ['일', '월', '화', '수', '목', '금', '토']
const OPTION_ROW = 'flex items-center justify-between gap-3 border-b border-line py-3 text-base last:border-b-0'

// cheer: { count, sent, busy, onCheer } — 로그인 상태의 그룹 화면에서만 전달
function MemberRow({ name, isMe, dates, avatar, cheer }) {
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
      <div className="flex flex-col items-end gap-1.5">
        <span className={cx('text-xs', doneToday ? 'font-semibold text-brand' : 'text-dim')}>
          {doneToday ? '오늘 완료' : '아직'}
        </span>
        {cheer && (isMe ? (
          cheer.count > 0 && <span className="text-2xs text-dim">응원 {cheer.count}개 받음</span>
        ) : (
          <button
            className={cx(
              'rounded-full border px-2.5 py-1 text-2xs font-semibold disabled:opacity-60',
              cheer.sent ? 'border-line bg-surface-2 text-dim' : 'border-brand/40 bg-brand/15 text-brand',
            )}
            disabled={cheer.sent || cheer.busy}
            onClick={cheer.onCheer}
            aria-label={`${name}님 응원하기`}
          >
            {cheer.sent ? '✓ 응원함' : doneToday ? '👏 잘했어요' : '💪 힘내요'}
            {cheer.count > 0 && <span className="ml-1 opacity-70">{cheer.count}</span>}
          </button>
        ))}
      </div>
    </div>
  )
}

export default function Group({ records, session }) {
  const [groups, setGroups] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [selectedId, setSelectedId] = useState(null)

  const loadGroups = useCallback(async () => {
    if (!supabase || !session) { setLoading(false); return [] }
    setLoading(true)
    setLoadError('')
    try {
      const list = await fetchMyGroups()
      setGroups(list)
      return list
    } catch (e) {
      setLoadError(e.message)
      return null
    } finally {
      setLoading(false)
    }
  }, [session])

  useEffect(() => { loadGroups() }, [loadGroups])

  // 나(내 기록)는 항상 로컬 기록 기준으로도 표시
  const myDates = new Set(lastNDays(7, records).filter(d => d.done).map(d => d.key))
  const myNick = getProfile().nickname // 비어 있으면 서버 닉네임을 그대로 사용
  const myName = myNick || '나'
  const myId = session?.user?.id

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

  // ── 그룹 상세 ──
  const selected = groups.find(g => g.id === selectedId)
  if (selected) {
    return (
      <GroupDetail
        group={selected}
        records={records}
        myId={myId}
        myName={myNick}
        myDates={myDates}
        onBack={() => setSelectedId(null)}
        onChanged={loadGroups}
        onLeft={() => { setSelectedId(null); loadGroups() }}
      />
    )
  }

  // ── 그룹 홈: 내 그룹 목록 + 참여/생성 ──
  return (
    <Page>
      <PageTitle>그룹</PageTitle>
      <Sub>
        {groups.length
          ? `참여 중인 그룹 ${groups.length}개 · 그룹을 눌러 현황을 확인하세요.`
          : '초대 코드로 참여하거나 새 그룹을 만들어 보세요.'}
      </Sub>

      {loading && !groups.length ? (
        <Sub className="mt-4">불러오는 중…</Sub>
      ) : loadError ? (
        <Card>
          <Sub className="text-brand">{loadError}</Sub>
          <Button variant="secondary" className="mt-3" onClick={loadGroups}>다시 시도</Button>
        </Card>
      ) : groups.length > 0 && (
        <div className="mt-4 flex flex-col gap-3">
          {groups.map(g => (
            <button
              key={g.id}
              className="flex w-full items-center gap-3.5 rounded-xl border border-line bg-surface p-4 text-left transition-transform active:scale-[.98]"
              onClick={() => setSelectedId(g.id)}
            >
              <GroupPhoto name={g.name} url={g.photo_url} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-lg font-bold">{g.name}</div>
                <div className="mt-0.5 text-xs text-dim">
                  멤버 {g.memberCount}/{g.max_members}명{g.created_by === myId && ' · 그룹장'}
                </div>
              </div>
              <svg className="size-5 flex-none text-dim" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="m9 6 6 6-6 6" />
              </svg>
            </button>
          ))}
        </div>
      )}

      <JoinCreateCard
        onDone={async (g) => {
          await loadGroups()
          setSelectedId(g.id)
        }}
      />
    </Page>
  )
}

// ── 초대 코드로 참여 / 그룹 만들기 ──────────────
function JoinCreateCard({ onDone }) {
  const [mode, setMode] = useState('join') // join | create
  const [input, setInput] = useState('')
  const [maxMembers, setMaxMembers] = useState('10')
  const [membersOnly, setMembersOnly] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

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
      const g = mode === 'create'
        ? await createGroup(input.trim(), nickname, { maxMembers: limit, membersOnly })
        : await joinGroup(input, nickname)
      setInput('')
      toast(mode === 'create' ? `'${g.name}' 그룹을 만들었어요.` : `'${g.name}' 그룹에 참여했어요.`)
      await onDone(g)
    } catch (e) {
      setError(e.message)
    }
    setBusy(false)
  }

  return (
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
  )
}

// ── 그룹 상세 (멤버 현황·리더보드·인증샷) ────────
function GroupDetail({ group, records, myId, myName, myDates, onBack, onChanged, onLeft }) {
  const [members, setMembers] = useState([])
  const [photos, setPhotos] = useState([])
  const [loaded, setLoaded] = useState(false)
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)
  const [cheers, setCheers] = useState({ counts: {}, byMe: new Set() })
  const [cheering, setCheering] = useState(null) // 응원 보내는 중인 멤버 id
  const isOwner = group.created_by === myId

  async function cheerFor(member) {
    setCheering(member.id)
    try {
      const cheerId = await sendCheer(group.id, member.id)
      if (cheerId) {
        notifyCheer(cheerId) // 받은 사람에게 푸시 (기다리지 않음)
        toast(`${member.name}님에게 응원을 보냈어요!`)
      } else {
        toast('오늘은 이미 응원했어요. 내일 또 응원해 주세요!')
      }
      setCheers(prev => ({
        counts: cheerId ? { ...prev.counts, [member.id]: (prev.counts[member.id] || 0) + 1 } : prev.counts,
        byMe: new Set([...prev.byMe, member.id]),
      }))
    } catch (e) {
      toast(e.message)
    }
    setCheering(null)
  }

  const load = useCallback(async () => {
    setBusy(true)
    try {
      const { members, photos } = await fetchGroupStatus(group.id)
      setMembers(members)
      setPhotos(photos)
      setCheers(await fetchTodayCheers(members.map(m => m.id)))
    } catch { /* 네트워크 오류 시 조용히 패스 */ }
    setLoaded(true)
    setBusy(false)
  }, [group.id])

  useEffect(() => { load() }, [load])

  async function onLeave() {
    const count = members.length || group.memberCount
    const msg = count <= 1
      ? '마지막 멤버라 나가면 그룹이 삭제돼요. 나갈까요?'
      : isOwner
        ? '그룹에서 나갈까요? 그룹장은 가장 먼저 참여한 멤버에게 넘어가요. 내 운동 기록은 사라지지 않아요.'
        : '그룹에서 나갈까요? 내 운동 기록은 사라지지 않아요.'
    if (!confirm(msg)) return
    setBusy(true)
    try {
      await leaveGroup({ ...group, memberCount: count })
      toast(`'${group.name}' 그룹에서 나왔어요.`)
      onLeft()
    } catch (e) {
      toast(e.message)
      setBusy(false)
    }
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
    const done = () => { setCopied(true); setTimeout(() => setCopied(false), 1500) }
    const fail = () => toast(`복사하지 못했어요. 초대 코드: ${group.invite_code}`)
    if (!navigator.clipboard?.writeText) return fail()
    navigator.clipboard.writeText(group.invite_code).then(done, fail)
  }

  // 오늘의 인증샷: 서버 사진 + (서버에 아직 없으면) 내 로컬 사진 보충
  const myLocalPhoto = records[todayKey()]?.photo
  const todayPhotos = [...photos]
  if (myId && myLocalPhoto && !todayPhotos.some(p => p.id === myId)) {
    todayPhotos.unshift({ id: myId, name: myName || '나', url: myLocalPhoto })
  }

  return (
    <Page>
      <button className="-ml-1 flex items-center gap-0.5 py-1 text-sm text-dim" onClick={onBack}>
        <svg className="size-4.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="m15 6-6 6 6 6" />
        </svg>
        그룹 목록
      </button>

      <Card className="mt-2">
        <div className="flex items-center gap-4">
          <GroupPhotoEditor group={group} editable={isOwner} onChanged={onChanged} />
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-2xl font-bold tracking-tight">{group.name}</h2>
            <div className="mt-0.5 text-xs text-dim">
              멤버 {members.length || group.memberCount}/{group.max_members}명{isOwner && ' · 내가 그룹장'}
            </div>
          </div>
        </div>
        <LinkButton className="mt-3.5 w-full rounded-md bg-surface-2 px-3.5 py-2.5 text-left text-sm" onClick={copyCode}>
          초대 코드 <strong className="ml-1 tracking-wider text-brand">{group.invite_code}</strong>
          <span className="float-right">{copied ? '✓ 복사됨' : '복사'}</span>
        </LinkButton>
      </Card>

      <Card>
        <CardTitle>멤버 현황</CardTitle>
        {!loaded ? (
          <Sub className="mt-2">불러오는 중…</Sub>
        ) : (
          <div className="mt-2">
            {members.map(m => (
              <MemberRow
                key={m.id}
                name={m.id === myId ? (myName || m.name) : m.name}
                isMe={m.id === myId}
                avatar={m.id === myId ? (getProfile().avatar || m.avatar) : m.avatar}
                dates={m.id === myId ? new Set([...m.dates, ...myDates]) : m.dates}
                cheer={{
                  count: cheers.counts[m.id] || 0,
                  sent: cheers.byMe.has(m.id),
                  busy: cheering === m.id,
                  onCheer: () => cheerFor(m),
                }}
              />
            ))}
          </div>
        )}
        <div className="mt-3 flex items-center gap-4 text-xs text-dim">
          <span><i className="mr-1.5 inline-block size-2.5 rounded-full bg-brand" />운동 함</span>
          <span><i className="mr-1.5 inline-block size-2.5 rounded-full bg-dot" />아직 안 함</span>
        </div>
      </Card>

      {loaded && <Leaderboard members={members} myId={myId} myName={myName} records={records} />}

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

// ── 그룹 사진 (그룹장만 변경) ───────────────────
// 사진 없음 → 탭하면 바로 업로드 / 사진 있음 → 교체·삭제 시트
function GroupPhotoEditor({ group, editable, onChanged }) {
  const fileRef = useRef(null)
  const [showSheet, setShowSheet] = useState(false)
  const [busy, setBusy] = useState(false)

  if (!editable) return <GroupPhoto name={group.name} url={group.photo_url} className="size-16 text-2xl" />

  async function handleFile(e) {
    const file = e.target.files?.[0]
    e.target.value = '' // 같은 파일 재선택 허용
    if (!file) return
    if (!file.type.startsWith('image/')) return toast('이미지 파일만 업로드할 수 있어요.')
    if (file.size > 10 * 1024 * 1024) return toast('10MB 이하의 사진만 업로드할 수 있어요.')
    setBusy(true)
    try {
      await uploadGroupPhoto(group.id, await compressImage(file, { max: 512, quality: 0.85 }))
      await onChanged()
      toast('그룹 사진을 바꿨어요.')
    } catch (err) {
      toast(err.message)
    }
    setBusy(false)
    setShowSheet(false)
  }

  async function remove() {
    setBusy(true)
    try {
      await removeGroupPhoto(group.id)
      await onChanged()
    } catch (err) {
      toast(err.message)
    }
    setBusy(false)
    setShowSheet(false)
  }

  return (
    <>
      <button
        className="relative flex-none rounded-full disabled:opacity-60"
        aria-label={group.photo_url ? '그룹 사진 관리' : '그룹 사진 추가'}
        disabled={busy}
        onClick={() => (group.photo_url ? setShowSheet(true) : fileRef.current?.click())}
      >
        <GroupPhoto name={group.name} url={group.photo_url} className="size-16 text-2xl" />
        <span className="absolute -right-0.5 -bottom-0.5 flex size-6 items-center justify-center rounded-full border-2 border-surface bg-brand text-white" aria-hidden="true">
          <svg className="size-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
            <circle cx="12" cy="13" r="4" />
          </svg>
        </span>
      </button>
      <input ref={fileRef} type="file" accept="image/*" hidden onChange={handleFile} />

      {showSheet && (
        <Modal label="그룹 사진" onBackdrop={() => setShowSheet(false)}>
          <ModalTitle>그룹 사진</ModalTitle>
          <Button variant="secondary" className="mt-4.5" disabled={busy} onClick={() => fileRef.current?.click()}>
            사진 교체
          </Button>
          <Button variant="danger" className="mt-2.5" disabled={busy} onClick={remove}>
            사진 삭제
          </Button>
          <Button variant="secondary" className="mt-2.5" onClick={() => setShowSheet(false)}>
            취소
          </Button>
        </Modal>
      )}
    </>
  )
}
