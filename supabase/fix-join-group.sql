-- 초대 코드 참여 오류 수정 — Supabase SQL Editor에서 실행 (재실행 안전)
-- 증상: 초대 코드로 참여 시 'column reference "invite_code" is ambiguous'
-- 원인: join_group 의 returns table(id, name, invite_code, ...) 출력 컬럼이 함수 안에서
--       변수로도 선언돼, where invite_code = code 의 invite_code 가 변수인지 컬럼인지 모호했음.
--       (회원만 받기 그룹에선 profiles 조회의 where id = uid 도 같은 이유로 실패)
-- 해결: #variable_conflict use_column + 모든 컬럼을 테이블 별칭으로 명시.
-- security-and-fixes.sql 의 4) 항목과 동일한 최신 정의예요.

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
  select * into g from public.groups gr where gr.invite_code = code for update;
  if g.id is null then raise exception '초대 코드를 찾을 수 없어요. 다시 확인해 주세요.'; end if;

  -- 이미 이 그룹 멤버면 그대로 반환 (재참여 무해)
  if exists (select 1 from public.group_members gm where gm.user_id = uid and gm.group_id = g.id) then
    return query select g.id, g.name, g.invite_code, g.max_members, g.members_only; return;
  end if;
  -- 다른 그룹에 이미 소속돼 있으면 차단 (단일 그룹 정책)
  if exists (select 1 from public.group_members gm where gm.user_id = uid) then
    raise exception '이미 다른 그룹에 참여 중이에요. 먼저 나간 뒤 참여해 주세요.';
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
