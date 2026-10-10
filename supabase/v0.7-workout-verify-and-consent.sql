-- Absolid v0.7 — 운동 완료 서버 검증 + 가입 동의 기록
-- Supabase SQL Editor에서 실행 (재실행 안전)
-- 선행: v0.6-security.sql 까지 실행되어 있어야 함
-- ⚠️ 이 SQL 을 실행한 직후 v0.7 프론트엔드를 배포하세요. (예전 앱은 기록을 직접 저장하므로 실행 후엔 저장이 거부됨)
--
-- 포함:
--   1) 시청 세션 — 영상 재생을 시작하면 서버가 시작 시각을 기록
--   2) 완료 처리 — 시작 후 영상 길이의 80% 이상 시간이 지나야 운동 기록 생성
--   3) 운동 기록 직접 생성 차단 — 기록은 2) 함수로만 만들어짐
--   4) 가입 동의 기록 — 만 14세 이상 확인, 약관 버전·동의 시각

-- ══════════════════════════════════════════════
-- 1) 시청 세션
-- ══════════════════════════════════════════════
create table if not exists public.workout_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  date date not null,                 -- 시청을 시작한 날(한국 시간) = 기록될 날짜
  video_seconds int not null,         -- 영상 길이(초, 60~3600 으로 보정)
  started_at timestamptz not null default now(),
  completed_at timestamptz
);
create index if not exists workout_sessions_user_started on public.workout_sessions (user_id, started_at desc);
-- RLS 를 켜고 정책을 두지 않음 → 사용자는 아래 함수로만 접근
alter table public.workout_sessions enable row level security;

create or replace function public.start_workout(p_video_seconds int)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  v_id uuid;
begin
  if uid is null then raise exception '로그인이 필요해요.'; end if;
  -- 하루 지난 미완료 세션 정리 (쌓이지 않게)
  delete from public.workout_sessions ws
  where ws.user_id = uid and ws.completed_at is null and ws.started_at < now() - interval '1 day';

  insert into public.workout_sessions (user_id, date, video_seconds)
  values (uid, (now() at time zone 'Asia/Seoul')::date,
          least(greatest(coalesce(p_video_seconds, 0), 60), 3600))
  returning id into v_id;
  return v_id;
end $$;

-- ══════════════════════════════════════════════
-- 2) 완료 처리
-- ══════════════════════════════════════════════
-- 반환: 기록된 날짜 (자정을 넘겨 끝내도 시작한 날로 기록)
create or replace function public.complete_workout(p_session uuid)
returns date language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  s public.workout_sessions;
begin
  if uid is null then raise exception '로그인이 필요해요.'; end if;

  select * into s from public.workout_sessions ws
  where ws.id = p_session and ws.user_id = uid
  for update;
  if s.id is null then
    raise exception '시청 기록을 찾을 수 없어요. 영상을 처음부터 다시 재생해 주세요.';
  end if;
  if s.completed_at is null then
    if now() - s.started_at < make_interval(secs => s.video_seconds * 0.8) then
      raise exception '영상을 끝까지 시청해야 완료로 기록돼요.';
    end if;
    if now() - s.started_at > interval '1 day' then
      raise exception '시청한 지 너무 오래돼 기록할 수 없어요.';
    end if;
    update public.workout_sessions ws set completed_at = now() where ws.id = s.id;
  end if;

  -- 같은 날 다시 시청하면 완료 시각만 갱신 (Day 번호는 v0.6 트리거가 날짜로 계산)
  insert into public.workouts (user_id, date, day, completed_at)
  values (uid, s.date, 1, now())
  on conflict (user_id, date) do update set completed_at = excluded.completed_at;
  return s.date;
end $$;

-- ══════════════════════════════════════════════
-- 3) 운동 기록 직접 생성 차단
-- ══════════════════════════════════════════════
-- 문제: API 로 직접 기록을 넣으면 영상을 보지 않고도 완료 처리할 수 있었음.
-- 해결: insert 정책 삭제 → complete_workout() 만 기록을 만들 수 있음.
--       (인증샷 연결·정리용 update, 초기화용 delete 정책은 유지)
drop policy if exists "workouts: 본인 기록" on public.workouts;

-- ══════════════════════════════════════════════
-- 4) 가입 동의 기록
-- ══════════════════════════════════════════════
alter table public.profiles
  add column if not exists age_over_14 boolean not null default false,
  add column if not exists terms_version text,
  add column if not exists terms_agreed_at timestamptz;
