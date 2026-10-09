-- Absolid v0.5 — 여러 그룹 참여 + 그룹 사진 + 점검 오류 수정
-- Supabase SQL Editor에서 실행 (재실행 안전)
-- 선행: schema.sql, storage.sql, avatars.sql, profiles-update.sql, groups-update.sql,
--       profiles-security-fix.sql, admin.sql, security-and-fixes.sql
--
-- 포함:
--   1) 역할 보호 트리거 — SQL Editor(서비스 권한)에서 관리자 지정이 되돌려지던 문제 수정
--   2) 그룹 사진 — groups.photo_url + group-photos 버킷 + 그룹장 전용 변경 함수
--   3) 그룹 생성·참여·나가기 RPC — 여러 그룹 참여 허용, 생성 원자화, 그룹장 자동 위임
--   4) group_members/groups 직접 쓰기 차단 — 정원·회원제한을 우회한 직접 가입 방지
--   5) 인증샷 조회 권한 — 본인·같은 그룹 멤버·관리자만
--   6) 관리자 통계 — '오늘'을 한국 시간 기준으로

-- ══════════════════════════════════════════════
-- 1) 역할 보호 트리거
-- ══════════════════════════════════════════════
-- 문제: SQL Editor 에서는 auth.uid() 가 없어 is_admin() 이 false →
--       update profiles set role='admin' 이 오류 없이 원래 값으로 되돌려졌음.
-- 해결: auth.uid() 가 없는 호출(SQL Editor·service_role)은 신뢰된 운영자 작업으로 보고 허용.
--       (anon 키로는 RLS 때문에 profiles 를 수정할 수 없음)
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
    if auth.uid() is null or public.is_admin() then
      null;                       -- 운영자(SQL Editor)·관리자는 자유롭게 변경
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

-- ══════════════════════════════════════════════
-- 2) 그룹 사진
-- ══════════════════════════════════════════════
alter table public.groups add column if not exists photo_url text;

-- 그룹장 여부 (스토리지 정책에서 폴더명=그룹 id 문자열로 확인)
create or replace function public.is_group_owner(p_gid text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.groups gr
    where gr.id::text = p_gid and gr.created_by = auth.uid()
  );
$$;

-- 그룹 사진 버킷: 공개 조회(프로필 사진과 같은 수준), 업로드·교체·삭제는 그룹장만
insert into storage.buckets (id, name, public)
values ('group-photos', 'group-photos', true)
on conflict (id) do nothing;

drop policy if exists "group-photos: 누구나 조회" on storage.objects;
create policy "group-photos: 누구나 조회" on storage.objects
  for select using (bucket_id = 'group-photos');
drop policy if exists "group-photos: 그룹장 업로드" on storage.objects;
create policy "group-photos: 그룹장 업로드" on storage.objects
  for insert with check (bucket_id = 'group-photos' and public.is_group_owner((storage.foldername(name))[1]));
drop policy if exists "group-photos: 그룹장 교체" on storage.objects;
create policy "group-photos: 그룹장 교체" on storage.objects
  for update using (bucket_id = 'group-photos' and public.is_group_owner((storage.foldername(name))[1]));
drop policy if exists "group-photos: 그룹장 삭제" on storage.objects;
create policy "group-photos: 그룹장 삭제" on storage.objects
  for delete using (bucket_id = 'group-photos' and public.is_group_owner((storage.foldername(name))[1]));

-- 그룹 사진 URL 저장 — 그룹장만, 이 그룹 폴더의 스토리지 주소만 허용 (null = 삭제)
create or replace function public.set_group_photo(p_gid uuid, p_url text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_group_owner(p_gid::text) then
    raise exception '그룹장만 그룹 사진을 바꿀 수 있어요.';
  end if;
  if p_url is not null and p_url not like '%/storage/v1/object/public/group-photos/' || p_gid::text || '/%' then
    raise exception '올바르지 않은 사진 주소예요.';
  end if;
  update public.groups gr set photo_url = p_url where gr.id = p_gid;
end $$;

-- ══════════════════════════════════════════════
-- 3) 그룹 생성·참여·나가기
-- ══════════════════════════════════════════════
-- 생성: 그룹 + 그룹장 멤버십을 한 트랜잭션으로 (중간 실패 시 빈 그룹이 남지 않음)
create or replace function public.create_group(p_name text, p_max_members int, p_members_only boolean)
returns setof public.groups
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  chars constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; -- 헷갈리는 문자(I,L,O,0,1) 제외
  v_name text := left(btrim(coalesce(p_name, '')), 20);
  v_code text;
  g public.groups;
begin
  if uid is null then raise exception '로그인이 필요해요.'; end if;
  if v_name = '' then raise exception '그룹 이름을 입력해 주세요.'; end if;
  if p_max_members is null or p_max_members < 2 or p_max_members > 50 then
    raise exception '인원수는 2~50명 사이로 입력해 주세요.';
  end if;

  -- 초대 코드 충돌 시 재시도 (최대 5회)
  for attempt in 1..5 loop
    v_code := '';
    for i in 1..6 loop
      v_code := v_code || substr(chars, 1 + floor(random() * length(chars))::int, 1);
    end loop;
    begin
      insert into public.groups (name, invite_code, created_by, max_members, members_only)
      values (v_name, v_code, uid, p_max_members, coalesce(p_members_only, false))
      returning * into g;
      exit;
    exception when unique_violation then
      g := null;
    end;
  end loop;
  if g.id is null then raise exception '그룹 생성에 실패했어요. 다시 시도해 주세요.'; end if;

  insert into public.group_members (group_id, user_id) values (g.id, uid);
  return next g;
end $$;

-- 참여: 정원·회원제한 확인을 원자적으로 (여러 그룹 참여 허용)
create or replace function public.join_group(code text)
returns table(id uuid, name text, invite_code text, max_members int, members_only boolean)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
-- returns table 의 출력 컬럼(id, invite_code 등)이 PL/pgSQL 변수로도 선언되므로
-- 쿼리 안의 같은 이름 컬럼과 충돌하지 않게 컬럼을 우선하고, 테이블 별칭으로 명시
declare
  g public.groups;
  uid uuid := auth.uid();
  cnt int;
  me public.profiles;
begin
  if uid is null then raise exception '로그인이 필요해요.'; end if;

  -- 그룹 행을 잠근 채 조회 → 동시 참여 경합 방지
  select * into g from public.groups gr where gr.invite_code = upper(btrim(code)) for update;
  if g.id is null then raise exception '초대 코드를 찾을 수 없어요. 다시 확인해 주세요.'; end if;

  -- 이미 이 그룹 멤버면 그대로 반환 (재참여 무해)
  if exists (select 1 from public.group_members gm where gm.user_id = uid and gm.group_id = g.id) then
    return query select g.id, g.name, g.invite_code, g.max_members, g.members_only; return;
  end if;

  -- 정원 확인
  select count(*) into cnt from public.group_members gm where gm.group_id = g.id;
  if cnt >= g.max_members then
    raise exception '이 그룹은 정원(%명)이 가득 찼어요.', g.max_members;
  end if;

  -- 회원만 받기: 이름·전화번호 등록 필수
  if g.members_only then
    select * into me from public.profiles p where p.id = uid;
    if coalesce(me.full_name, '') = '' or coalesce(me.phone, '') = '' then
      raise exception '이 그룹은 이름·전화번호를 등록한 회원만 참여할 수 있어요. 설정에서 회원가입을 완료해 주세요.';
    end if;
  end if;

  insert into public.group_members (group_id, user_id) values (g.id, uid)
    on conflict do nothing;

  return query select g.id, g.name, g.invite_code, g.max_members, g.members_only;
end $$;

-- 내부용: 멤버가 빠진 뒤 그룹장 위임 (남은 멤버 중 가장 먼저 참여한 사람) / 아무도 없으면 그룹 삭제
-- 반환: true = 그룹이 삭제됨
create or replace function public._handoff_group(p_gid uuid, p_leaving uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_next uuid;
begin
  select gm.user_id into v_next
  from public.group_members gm
  where gm.group_id = p_gid and gm.user_id <> p_leaving
  order by gm.joined_at, gm.user_id
  limit 1;

  if v_next is null then
    delete from public.groups gr where gr.id = p_gid;
    return true;
  end if;

  -- 나간 사람이 그룹장이었거나, 그룹장이 이미 멤버가 아닌(과거 데이터) 경우 위임
  update public.groups gr set created_by = v_next
  where gr.id = p_gid
    and (gr.created_by = p_leaving
         or not exists (select 1 from public.group_members m where m.group_id = gr.id and m.user_id = gr.created_by));
  return false;
end $$;
revoke all on function public._handoff_group(uuid, uuid) from public, anon, authenticated;

-- 나가기: 그룹장이 나가면 자동 위임, 마지막 멤버면 그룹 삭제
-- 반환: true = 그룹이 삭제됨
create or replace function public.leave_group(p_gid uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception '로그인이 필요해요.'; end if;
  perform 1 from public.groups gr where gr.id = p_gid for update; -- 동시 나가기 경합 방지
  delete from public.group_members gm where gm.group_id = p_gid and gm.user_id = uid;
  if not found then return false; end if;
  return public._handoff_group(p_gid, uid);
end $$;

-- 회원 탈퇴용(delete-account 엣지 함수, service_role 전용):
-- 탈퇴자의 모든 그룹에서 빠지면서 그룹장 위임 → 삭제된 그룹 id 반환(그룹 사진 정리용)
create or replace function public.handoff_user_groups(p_uid uuid)
returns setof uuid language plpgsql security definer set search_path = public as $$
declare r record;
begin
  for r in
    select gm.group_id as gid from public.group_members gm where gm.user_id = p_uid
    union
    select gr.id from public.groups gr where gr.created_by = p_uid
  loop
    perform 1 from public.groups gr where gr.id = r.gid for update;
    delete from public.group_members gm where gm.group_id = r.gid and gm.user_id = p_uid;
    if public._handoff_group(r.gid, p_uid) then
      return next r.gid;
    end if;
  end loop;
end $$;
revoke all on function public.handoff_user_groups(uuid) from public, anon, authenticated;
grant execute on function public.handoff_user_groups(uuid) to service_role;

-- ══════════════════════════════════════════════
-- 4) 직접 쓰기 차단 — 생성·참여·나가기는 위 함수로만
-- ══════════════════════════════════════════════
-- 문제: "본인 참여" 정책으로 API 직접 호출 시 정원·회원제한 검사를 건너뛰고 가입 가능했음.
drop policy if exists "members: 본인 참여" on public.group_members;
drop policy if exists "members: 본인 탈퇴" on public.group_members;     -- 그룹장 위임을 거치도록
drop policy if exists "groups: 로그인 사용자 생성" on public.groups;    -- 멤버 없는 그룹 생성 방지

-- ══════════════════════════════════════════════
-- 5) 인증샷 조회 권한 — 본인·같은 그룹 멤버·관리자만
-- ══════════════════════════════════════════════
-- 문제: "인증된 사용자 조회" 정책으로 로그인한 누구나 모든 회원의 인증샷을 열람 가능했음.
create or replace function public.shares_group_with(p_user text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.group_members a
    join public.group_members b on b.group_id = a.group_id
    where a.user_id = auth.uid() and b.user_id::text = p_user
  );
$$;

drop policy if exists "photos: 누구나 조회" on storage.objects;
drop policy if exists "photos: 인증된 사용자 조회" on storage.objects;
drop policy if exists "photos: 본인·그룹·관리자 조회" on storage.objects;
create policy "photos: 본인·그룹·관리자 조회" on storage.objects
  for select using (
    bucket_id = 'photos' and (
      (storage.foldername(name))[1] = auth.uid()::text
      or public.is_admin()
      or public.shares_group_with((storage.foldername(name))[1])
    )
  );

-- ══════════════════════════════════════════════
-- 6) 관리자 통계 — '오늘'을 한국 시간 기준으로
-- ══════════════════════════════════════════════
-- 문제: current_date 가 UTC 기준이라 한국 시간 0~9시엔 '오늘 운동'이 어제 기준으로 집계됐음.
create or replace function public.admin_stats()
returns json language plpgsql security definer set search_path = public as $$
declare
  result json;
  today date := (now() at time zone 'Asia/Seoul')::date;
begin
  if not public.is_admin() then
    raise exception '관리자만 사용할 수 있어요.';
  end if;
  select json_build_object(
    'total_users', (select count(*) from public.profiles),
    'new_users_7d', (select count(*) from auth.users where created_at > now() - interval '7 days'),
    'active_today', (select count(distinct user_id) from public.workouts where date = today),
    'active_7d', (select count(distinct user_id) from public.workouts where date > today - 7),
    'total_workouts', (select count(*) from public.workouts),
    'total_groups', (select count(*) from public.groups),
    'pending_reports', (select count(*) from public.reports where status = 'pending'),
    'photos_count', (select count(*) from storage.objects where bucket_id = 'photos'),
    'photos_bytes', (select coalesce(sum((metadata->>'size')::bigint), 0) from storage.objects where bucket_id = 'photos')
  ) into result;
  return result;
end $$;
