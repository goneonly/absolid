-- Absolid v0.8 — 그룹 응원 + 알림 마무리
-- Supabase SQL Editor에서 실행 (재실행 안전)
-- 선행: v0.7-workout-verify-and-consent.sql 까지 실행되어 있어야 함
--
-- 포함:
--   1) 응원(cheers) — 같은 그룹 멤버에게 하루 한 번 응원 (운동했으면 👏, 아직이면 💪)
--   2) 응원 보내기 / 오늘 받은 응원 조회 함수
--   3) 푸시 구독 등록 함수 — 한 기기에서 계정을 바꿔도 알림이 새 계정으로 가게

-- ══════════════════════════════════════════════
-- 1) 응원
-- ══════════════════════════════════════════════
create table if not exists public.cheers (
  id bigint generated always as identity primary key,
  group_id uuid not null references public.groups on delete cascade, -- 응원을 보낸 그룹 (알림 문구용)
  from_user uuid not null references auth.users on delete cascade,
  to_user uuid not null references auth.users on delete cascade,
  date date not null,                                          -- 한국 시간 기준 날짜
  kind text not null check (kind in ('done', 'nudge')),        -- done: 운동한 사람에게 👏 / nudge: 아직인 사람에게 💪
  created_at timestamptz not null default now(),
  notified_at timestamptz,                                     -- 푸시 알림을 보낸 시각 (중복 발송 방지)
  unique (from_user, to_user, date),                           -- 같은 사람에게 하루 한 번
  check (from_user <> to_user)
);
create index if not exists cheers_to_date on public.cheers (to_user, date);
alter table public.cheers enable row level security;

-- 조회: 보낸 사람·받은 사람, 그리고 받은 사람과 같은 그룹인 멤버 (그룹 화면의 응원 수 표시)
-- 쓰기 정책은 두지 않음 → send_cheer() 로만 생성
drop policy if exists "cheers: 관련 멤버 조회" on public.cheers;
create policy "cheers: 관련 멤버 조회" on public.cheers
  for select using (
    from_user = auth.uid() or to_user = auth.uid() or public.shares_group_with(to_user::text)
  );

-- ══════════════════════════════════════════════
-- 2) 응원 보내기 / 받은 응원 조회
-- ══════════════════════════════════════════════
-- 반환: 새로 만든 응원 id (오늘 이미 응원했으면 null)
create or replace function public.send_cheer(p_group uuid, p_to uuid)
returns bigint language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  today date := (now() at time zone 'Asia/Seoul')::date;
  v_kind text;
  v_id bigint;
begin
  if uid is null then raise exception '로그인이 필요해요.'; end if;
  if p_to = uid then raise exception '자기 자신은 응원할 수 없어요.'; end if;
  if not exists (select 1 from public.group_members gm where gm.group_id = p_group and gm.user_id = uid)
     or not exists (select 1 from public.group_members gm where gm.group_id = p_group and gm.user_id = p_to) then
    raise exception '같은 그룹 멤버만 응원할 수 있어요.';
  end if;

  -- 응원 종류는 서버가 판단 (상대가 오늘 운동했는지)
  v_kind := case when exists (
    select 1 from public.workouts w where w.user_id = p_to and w.date = today
  ) then 'done' else 'nudge' end;

  insert into public.cheers (group_id, from_user, to_user, date, kind)
  values (p_group, uid, p_to, today, v_kind)
  on conflict (from_user, to_user, date) do nothing
  returning id into v_id;
  return v_id;
end $$;

-- 오늘 내가 받은 응원 (보낸 사람 닉네임 포함 — 이름·전화번호는 노출 안 함)
create or replace function public.my_received_cheers()
returns table(from_nickname text, kind text, group_name text, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select coalesce(nullif(p.nickname, ''), '이름 없음'), c.kind, g.name, c.created_at
  from public.cheers c
  left join public.profiles p on p.id = c.from_user
  left join public.groups g on g.id = c.group_id
  where c.to_user = auth.uid()
    and c.date = (now() at time zone 'Asia/Seoul')::date
  order by c.created_at desc;
$$;

-- ══════════════════════════════════════════════
-- 3) 푸시 구독 등록
-- ══════════════════════════════════════════════
-- 문제: 같은 브라우저(endpoint)에서 다른 계정이 알림을 켜면, 기존 행의 주인이 달라
--       "본인 수정" 정책에 막혀 등록이 실패했음 (알림이 예전 계정으로 감).
-- 해결: 이 기기의 구독을 현재 로그인한 계정으로 옮겨 등록.
create or replace function public.register_push(p_endpoint text, p_p256dh text, p_auth text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception '로그인이 필요해요.'; end if;
  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth)
  values (auth.uid(), p_endpoint, p_p256dh, p_auth)
  on conflict (endpoint) do update
    set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth;
end $$;
