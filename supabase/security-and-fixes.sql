-- Absolid 보안·버그 통합 패치 (v0.4) — Supabase SQL Editor에서 실행 (재실행 안전)
-- 선행: schema.sql, storage.sql, admin.sql 이 먼저 실행되어 있어야 함 (is_admin() 필요)
--
-- 포함:
--   1) 권한 상승 차단  — 일반 사용자가 자기 role/is_active 를 바꾸지 못하게 막음 + 지정 이메일 자동 관리자
--   2) 관리자 profiles 조회 정책 — 관리자 회원 관리·신고자 이름 조회 복구
--   3) 인증샷 비공개 버킷 전환 — signed URL 로만 열람 (프론트 배포 후 실행 권장, 아래 주의 참고)
--   4) 그룹 참여 원자적 처리 — 정원 초과 경합 방지 + 단일 그룹 정책
--   5) 회원 탈퇴용 본인 프로필 삭제 정책
--   6) 정책 멱등성 정리 (재실행 안전)

-- ══════════════════════════════════════════════
-- 1) 권한 상승 차단 + 자동 관리자 (auto-admin.sql 대체)
-- ══════════════════════════════════════════════
-- 문제: profiles."본인 수정" 정책에 컬럼 제한(WITH CHECK)이 없어
--       로그인 사용자가 update profiles set role='admin' 으로 스스로 관리자가 될 수 있었음.
-- 해결: 트리거로 role/is_active 변경을 관리자(및 지정 이메일)로만 제한.
create or replace function public.protect_profile_privileges()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  admin_email constant text := '4onlygone@gmail.com';  -- 자동 관리자 이메일 (필요시 변경)
  is_special boolean;
begin
  select exists(
    select 1 from auth.users u where u.id = new.id and lower(u.email) = admin_email
  ) into is_special;

  if tg_op = 'INSERT' then
    -- 신규 가입은 항상 일반·활성으로 시작 (admin 으로 위장한 insert 차단)
    new.role := case when is_special then 'admin' else 'user' end;
    new.is_active := true;
  else -- UPDATE
    if public.is_admin() then
      null;                       -- 관리자는 자유롭게 변경 (회원 비활성 처리 등)
    elsif is_special then
      new.role := 'admin';        -- 지정 이메일은 admin 유지
      new.is_active := old.is_active;
    else
      new.role := old.role;       -- 그 외 사용자는 role/is_active 를 이전 값으로 강제 고정
      new.is_active := old.is_active;
    end if;
  end if;
  return new;
end $$;

-- 기존 자동관리자 트리거 제거 후 통합 트리거로 교체
drop trigger if exists trg_grant_admin_by_email on public.profiles;
drop trigger if exists trg_protect_profile_privileges on public.profiles;
create trigger trg_protect_profile_privileges
  before insert or update on public.profiles
  for each row execute function public.protect_profile_privileges();

-- 이미 가입된 지정 이메일 즉시 관리자 적용
update public.profiles set role = 'admin'
where id in (select id from auth.users where lower(email) = '4onlygone@gmail.com');

-- ══════════════════════════════════════════════
-- 2) 관리자 profiles 조회 정책 (회원 관리 화면 복구)
-- ══════════════════════════════════════════════
-- 문제: profiles 조회 정책이 "본인 전체 조회" 뿐이라 관리자 회원목록이 본인 1명만 반환됐음.
drop policy if exists "profiles: 관리자 조회" on public.profiles;
create policy "profiles: 관리자 조회" on public.profiles
  for select using (public.is_admin());

-- ══════════════════════════════════════════════
-- 3) 인증샷(photos) 비공개 버킷 전환
-- ══════════════════════════════════════════════
-- ⚠️ 주의: 이 문장은 signed URL 을 사용하는 프론트엔드(v0.4)를 "먼저 배포한 뒤" 실행하세요.
--     기존 public URL 로 저장된 사진도 프론트가 경로를 추출해 signed URL 로 다시 서명하므로
--     배포 후에는 정상 표시됩니다. 배포 전에 비공개로 바꾸면 잠깐 사진이 안 보일 수 있어요.
update storage.buckets set public = false where id = 'photos';
-- 프로필 사진(avatars)은 민감도가 낮아 공개 유지 (변경하지 않음)

-- ══════════════════════════════════════════════
-- 4) 그룹 참여 원자적 처리 (정원 경합 방지 + 단일 그룹)
-- ══════════════════════════════════════════════
create or replace function public.join_group(code text)
returns table(id uuid, name text, invite_code text, max_members int, members_only boolean)
language plpgsql security definer set search_path = public as $$
declare
  g public.groups;
  uid uuid := auth.uid();
  cnt int;
  me public.profiles;
begin
  if uid is null then raise exception '로그인이 필요해요.'; end if;

  -- 그룹 행을 잠근 채 조회 → 동시 참여 경합 방지
  select * into g from public.groups where invite_code = code for update;
  if g.id is null then raise exception '초대 코드를 찾을 수 없어요. 다시 확인해 주세요.'; end if;

  -- 이미 이 그룹 멤버면 그대로 반환 (재참여 무해)
  if exists (select 1 from public.group_members where user_id = uid and group_id = g.id) then
    return query select g.id, g.name, g.invite_code, g.max_members, g.members_only; return;
  end if;
  -- 다른 그룹에 이미 소속돼 있으면 차단 (단일 그룹 정책)
  if exists (select 1 from public.group_members where user_id = uid) then
    raise exception '이미 다른 그룹에 참여 중이에요. 먼저 나간 뒤 참여해 주세요.';
  end if;

  -- 정원 확인
  select count(*) into cnt from public.group_members where group_id = g.id;
  if cnt >= g.max_members then
    raise exception '이 그룹은 정원(%명)이 가득 찼어요.', g.max_members;
  end if;

  -- 회원만 받기: 이름·전화번호 등록 필수
  if g.members_only then
    select * into me from public.profiles where id = uid;
    if coalesce(me.full_name, '') = '' or coalesce(me.phone, '') = '' then
      raise exception '이 그룹은 이름·전화번호를 등록한 회원만 참여할 수 있어요. 설정에서 회원가입을 완료해 주세요.';
    end if;
  end if;

  insert into public.group_members (group_id, user_id) values (g.id, uid)
    on conflict do nothing;

  return query select g.id, g.name, g.invite_code, g.max_members, g.members_only;
end $$;

-- ══════════════════════════════════════════════
-- 5) 회원 탈퇴용 본인 프로필 삭제 정책
-- ══════════════════════════════════════════════
-- (계정 자체 삭제는 supabase/functions/delete-account 엣지 함수가 service_role 로 처리)
drop policy if exists "profiles: 본인 삭제" on public.profiles;
create policy "profiles: 본인 삭제" on public.profiles
  for delete using (auth.uid() = id);

-- ══════════════════════════════════════════════
-- 6) 정책 멱등성 정리 (storage.sql / avatars.sql 재실행 시 중복 에러 방지)
-- ══════════════════════════════════════════════
drop policy if exists "photos: 본인 폴더 업로드" on storage.objects;
create policy "photos: 본인 폴더 업로드" on storage.objects
  for insert with check (bucket_id = 'photos' and auth.uid()::text = (storage.foldername(name))[1]);
drop policy if exists "photos: 본인 폴더 덮어쓰기" on storage.objects;
create policy "photos: 본인 폴더 덮어쓰기" on storage.objects
  for update using (bucket_id = 'photos' and auth.uid()::text = (storage.foldername(name))[1]);
drop policy if exists "photos: 누구나 조회" on storage.objects;
create policy "photos: 인증된 사용자 조회" on storage.objects
  for select using (bucket_id = 'photos' and auth.role() = 'authenticated');
drop policy if exists "photos: 본인 폴더 삭제" on storage.objects;
create policy "photos: 본인 폴더 삭제" on storage.objects
  for delete using (bucket_id = 'photos' and auth.uid()::text = (storage.foldername(name))[1]);
