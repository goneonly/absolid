-- 그룹 옵션(인원수 제한 검증 + 회원만 받기) — Supabase SQL Editor에서 실행

-- 1) 회원만 받기 옵션 컬럼
alter table public.groups
  add column if not exists members_only boolean not null default false;

-- (예전의 group_member_count 함수는 앱에서 쓰지 않아 v0.6-security.sql 에서 삭제됨)
