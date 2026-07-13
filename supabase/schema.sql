-- Absolid DB 스키마 v1 (Supabase SQL Editor에 붙여넣어 실행)
-- 포함: 프로필, 운동 기록, 그룹(Day 3~4에서 사용)

-- ── 프로필 ──────────────────────────────────
create table if not exists public.profiles (
  id uuid primary key references auth.users on delete cascade,
  nickname text not null default '',
  updated_at timestamptz not null default now()
);
alter table public.profiles enable row level security;

create policy "profiles: 누구나 닉네임 조회" on public.profiles
  for select using (true);
create policy "profiles: 본인 생성" on public.profiles
  for insert with check (auth.uid() = id);
create policy "profiles: 본인 수정" on public.profiles
  for update using (auth.uid() = id);

-- ── 운동 기록 ────────────────────────────────
create table if not exists public.workouts (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users on delete cascade,
  date date not null,
  day int not null check (day between 1 and 30),
  completed_at timestamptz not null default now(),
  photo_url text,
  unique (user_id, date)
);
alter table public.workouts enable row level security;

create policy "workouts: 본인 조회" on public.workouts
  for select using (auth.uid() = user_id);
create policy "workouts: 본인 기록" on public.workouts
  for insert with check (auth.uid() = user_id);
create policy "workouts: 본인 수정" on public.workouts
  for update using (auth.uid() = user_id);

-- ── 그룹 (Day 3~4) ──────────────────────────
create table if not exists public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  invite_code text not null unique,
  max_members int not null default 10 check (max_members between 2 and 50),
  created_by uuid not null references auth.users,
  created_at timestamptz not null default now()
);
alter table public.groups enable row level security;

create table if not exists public.group_members (
  group_id uuid not null references public.groups on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);
alter table public.group_members enable row level security;

-- 멤버십 확인 함수 (RLS 무한 재귀 방지용 security definer)
create or replace function public.is_group_member(gid uuid)
returns boolean language sql security definer set search_path = public as $$
  select exists (
    select 1 from public.group_members
    where group_id = gid and user_id = auth.uid()
  );
$$;

-- 그룹 정책 (기본형 — Day 3에서 초대코드 참여 로직과 함께 사용)
create policy "groups: 로그인 사용자 생성" on public.groups
  for insert with check (auth.uid() = created_by);
create policy "groups: 누구나 조회(초대코드 검증용)" on public.groups
  for select using (true);
create policy "members: 본인 참여" on public.group_members
  for insert with check (auth.uid() = user_id);
create policy "members: 본인 탈퇴" on public.group_members
  for delete using (auth.uid() = user_id);
create policy "members: 같은 그룹 멤버 조회" on public.group_members
  for select using (public.is_group_member(group_id));

-- 같은 그룹 멤버끼리 서로의 운동 기록(완료 여부) 조회 허용
create policy "workouts: 같은 그룹 멤버 조회" on public.workouts
  for select using (
    exists (
      select 1
      from public.group_members them
      where them.user_id = workouts.user_id
        and public.is_group_member(them.group_id)
    )
  );
