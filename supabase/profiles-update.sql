-- 회원가입 시 이름·전화번호 저장 (Supabase SQL Editor에서 실행)
alter table public.profiles
  add column if not exists full_name text not null default '',
  add column if not exists phone text not null default '';
