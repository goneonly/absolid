-- Absolid 자동 관리자 부여 — Supabase SQL Editor에서 실행 (재실행 안전)
-- 지정된 이메일로 회원가입하면 자동으로 role = 'admin'이 됩니다.

-- ── 1) 자동 부여 함수 ────────────────────────
create or replace function public.grant_admin_by_email()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if exists (
    select 1 from auth.users u
    where u.id = new.id
      and lower(u.email) = '4onlygone@gmail.com'
  ) then
    new.role := 'admin';
  end if;
  return new;
end;
$$;

-- ── 2) 트리거 (프로필 생성/수정 시 적용) ─────
drop trigger if exists trg_grant_admin_by_email on public.profiles;
create trigger trg_grant_admin_by_email
  before insert or update on public.profiles
  for each row execute function public.grant_admin_by_email();

-- ── 3) 이미 가입된 경우 즉시 적용 ────────────
update public.profiles set role = 'admin'
where id in (select id from auth.users where lower(email) = '4onlygone@gmail.com');
