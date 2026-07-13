-- 그룹 옵션(인원수 제한 검증 + 회원만 받기) — Supabase SQL Editor에서 실행

-- 1) 회원만 받기 옵션 컬럼
alter table public.groups
  add column if not exists members_only boolean not null default false;

-- 2) 그룹 인원 수 조회 함수
-- 비멤버는 RLS 때문에 group_members를 셀 수 없으므로 security definer로 제공
create or replace function public.group_member_count(gid uuid)
returns int language sql security definer set search_path = public as $$
  select count(*)::int from public.group_members where group_id = gid;
$$;
