-- AbsDay 관리자 모드 v1 — Supabase SQL Editor에서 실행
-- 포함: 역할/활성 컬럼, 관리자 정책, 신고, 공지, 앱 설정, 통계 함수

-- ── 1) 역할·활성 컬럼 ────────────────────────
alter table public.profiles
  add column if not exists role text not null default 'user' check (role in ('user', 'admin')),
  add column if not exists is_active boolean not null default true;

-- ── 2) 관리자 판별 함수 ──────────────────────
create or replace function public.is_admin()
returns boolean language sql security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and role = 'admin'
  );
$$;

-- ── 3) 관리자 권한 정책 ──────────────────────
create policy "profiles: 관리자 수정" on public.profiles
  for update using (public.is_admin());
create policy "workouts: 관리자 조회" on public.workouts
  for select using (public.is_admin());
create policy "workouts: 관리자 수정" on public.workouts
  for update using (public.is_admin());
create policy "groups: 관리자 삭제" on public.groups
  for delete using (public.is_admin());
create policy "members: 관리자 조회" on public.group_members
  for select using (public.is_admin());
create policy "members: 관리자 삭제" on public.group_members
  for delete using (public.is_admin());
create policy "photos: 관리자 삭제" on storage.objects
  for delete using (bucket_id = 'photos' and public.is_admin());

-- ── 4) 인증샷 신고 ──────────────────────────
create table if not exists public.reports (
  id bigint generated always as identity primary key,
  reporter_id uuid not null references auth.users on delete cascade,
  target_user_id uuid not null references auth.users on delete cascade,
  target_date date not null,
  reason text not null default '',
  status text not null default 'pending' check (status in ('pending', 'resolved', 'dismissed')),
  created_at timestamptz not null default now()
);
alter table public.reports enable row level security;

create policy "reports: 본인 신고 생성" on public.reports
  for insert with check (auth.uid() = reporter_id);
create policy "reports: 관리자 조회" on public.reports
  for select using (public.is_admin());
create policy "reports: 관리자 처리" on public.reports
  for update using (public.is_admin());

-- ── 5) 공지 ─────────────────────────────────
create table if not exists public.announcements (
  id bigint generated always as identity primary key,
  message text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.announcements enable row level security;

create policy "announcements: 누구나 조회" on public.announcements
  for select using (true);
create policy "announcements: 관리자 생성" on public.announcements
  for insert with check (public.is_admin());
create policy "announcements: 관리자 수정" on public.announcements
  for update using (public.is_admin());
create policy "announcements: 관리자 삭제" on public.announcements
  for delete using (public.is_admin());

-- ── 6) 앱 설정 (운동 플레이리스트 등) ─────────
create table if not exists public.app_config (
  key text primary key,
  value text not null default ''
);
alter table public.app_config enable row level security;

create policy "config: 누구나 조회" on public.app_config
  for select using (true);
create policy "config: 관리자 생성" on public.app_config
  for insert with check (public.is_admin());
create policy "config: 관리자 수정" on public.app_config
  for update using (public.is_admin());

insert into public.app_config (key, value)
values ('playlist_id', 'PLmP-4qxDY1uctg8gjjxQP2nrFmJ0aAB_6')
on conflict (key) do nothing;

-- ── 7) 관리자 통계 함수 ──────────────────────
create or replace function public.admin_stats()
returns json language plpgsql security definer set search_path = public as $$
declare result json;
begin
  if not public.is_admin() then
    raise exception '관리자만 사용할 수 있어요.';
  end if;
  select json_build_object(
    'total_users', (select count(*) from public.profiles),
    'new_users_7d', (select count(*) from auth.users where created_at > now() - interval '7 days'),
    'active_today', (select count(distinct user_id) from public.workouts where date = current_date),
    'active_7d', (select count(distinct user_id) from public.workouts where date > current_date - 7),
    'total_workouts', (select count(*) from public.workouts),
    'total_groups', (select count(*) from public.groups),
    'pending_reports', (select count(*) from public.reports where status = 'pending'),
    'photos_count', (select count(*) from storage.objects where bucket_id = 'photos'),
    'photos_bytes', (select coalesce(sum((metadata->>'size')::bigint), 0) from storage.objects where bucket_id = 'photos')
  ) into result;
  return result;
end $$;

-- ── 8) 나를 관리자로 지정 (이메일을 본인 것으로 바꿔 실행) ──
-- update public.profiles set role = 'admin'
-- where id = (select id from auth.users where email = 'haru@jaebomone.top');
