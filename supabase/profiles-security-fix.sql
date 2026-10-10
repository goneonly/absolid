-- 회원정보 노출 취약점 수정 (Supabase SQL Editor에서 실행)
-- 문제: profiles."누구나 닉네임 조회" 정책이 select using(true)라서
--       나중에 추가된 full_name·phone까지 anon key만 있으면 전체 조회 가능했음.
--       groups."누구나 조회" 정책도 invite_code를 전체 공개해 무단 가입이 가능했음.
-- 해결: 본인 행만 전체 조회 허용하고, 그룹 화면에 필요한 최소 정보(닉네임·아바타)와
--       초대코드 단건 조회는 security definer 함수로만 노출.

-- ── profiles: 본인만 전체 조회 가능 ──────────────
drop policy if exists "profiles: 누구나 닉네임 조회" on public.profiles;
drop policy if exists "profiles: 본인 전체 조회" on public.profiles;
create policy "profiles: 본인 전체 조회" on public.profiles
  for select using (auth.uid() = id);

-- 같은 그룹 멤버의 닉네임·아바타만 반환 (실명·전화번호는 노출 안 됨)
create or replace function public.get_group_profiles(gid uuid)
returns table(id uuid, nickname text, avatar_url text)
language sql security definer set search_path = public as $$
  select p.id, p.nickname, p.avatar_url
  from public.profiles p
  join public.group_members gm on gm.user_id = p.id
  where gm.group_id = gid and public.is_group_member(gid);
$$;

-- ── groups: 초대코드 전체 공개 차단, 본인 소속 그룹만 조회 ──
drop policy if exists "groups: 누구나 조회(초대코드 검증용)" on public.groups;
drop policy if exists "groups: 본인 소속 그룹 조회" on public.groups;
create policy "groups: 본인 소속 그룹 조회" on public.groups
  for select using (auth.uid() = created_by or public.is_group_member(id));

-- (예전의 find_group_by_invite_code 함수는 join_group 으로 대체되어 v0.6-security.sql 에서 삭제됨)
