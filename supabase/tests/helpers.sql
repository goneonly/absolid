-- 테스트 도우미 — 사용자 전환과 판정 함수 (모든 판정은 실패 시 오류를 내 테스트를 멈춤)
create schema tests;
grant usage on schema tests to anon, authenticated, service_role;

-- 테스트 회원 (이름 → id)
create table tests.users (name text primary key, id uuid not null unique);
grant select on tests.users to anon, authenticated, service_role;
insert into tests.users values
  ('A', 'a0000000-0000-0000-0000-00000000000a'),  -- 응원반·회원반 그룹장, 이름·전화번호 등록
  ('B', 'b0000000-0000-0000-0000-00000000000b'),  -- 응원반 멤버, 이름·전화번호 등록
  ('C', 'c0000000-0000-0000-0000-00000000000c'),  -- 그룹 밖 사람, 이름·전화번호 없음
  ('M', 'd0000000-0000-0000-0000-00000000000d'),  -- 관리자
  ('E', 'e0000000-0000-0000-0000-00000000000e');  -- 가입 직후 (프로필 아직 없음)

create function tests.uid(p_name text) returns uuid language sql stable as $$
  select id from tests.users where name = p_name
$$;

-- ── 사용자 전환 ──────────────────────────────
-- 로그인 사용자 (앱에서 publishable key + 로그인 토큰으로 요청하는 상황)
create function tests.login(p_name text) returns void language sql as $$
  select set_config('request.jwt.claim.sub', tests.uid(p_name)::text, false), set_config('role', 'authenticated', false)
$$;
-- 비로그인 (publishable key 만으로 요청)
create function tests.logout() returns void language sql as $$
  select set_config('request.jwt.claim.sub', '', false), set_config('role', 'anon', false)
$$;
-- 운영자 (SQL Editor — RLS·트리거 제한 밖)
create function tests.as_operator() returns void language sql as $$
  select set_config('request.jwt.claim.sub', '', false), set_config('role', 'none', false)
$$;
-- 서버 함수 (Edge Function 의 service_role 키)
create function tests.as_service() returns void language sql as $$
  select set_config('request.jwt.claim.sub', '', false), set_config('role', 'service_role', false)
$$;

-- RLS 와 상관없이 그룹 id·초대코드 조회 (테스트 준비용)
create function tests.gid(p_name text) returns uuid language sql stable security definer as $$
  select id from public.groups where name = p_name
$$;
create function tests.code(p_name text) returns text language sql stable security definer as $$
  select invite_code from public.groups where name = p_name
$$;

-- ── 판정 ────────────────────────────────────
create function tests.pass(p_label text) returns void language plpgsql as $$
begin
  raise notice 'ok - %', p_label;
end $$;

create function tests.ok(p_cond boolean, p_label text) returns void language plpgsql as $$
begin
  if p_cond is not true then raise exception 'FAIL: %', p_label; end if;
  perform tests.pass(p_label);
end $$;

create function tests.eq(p_got anycompatible, p_want anycompatible, p_label text) returns void language plpgsql as $$
begin
  if p_got is distinct from p_want then
    raise exception 'FAIL: % — 기대값 %, 실제 %', p_label, p_want, p_got;
  end if;
  perform tests.pass(p_label);
end $$;

-- 조회 결과 행 수 (현재 사용자 권한으로 실행)
create function tests.count(p_sql text) returns bigint language plpgsql as $$
declare n bigint;
begin
  execute format('select count(*) from (%s) q', p_sql) into n;
  return n;
end $$;

-- 오류가 나야 통과 — p_match 가 있으면 오류 메시지에 그 문구가 있어야 함
create function tests.throws(p_sql text, p_match text, p_label text) returns void language plpgsql as $$
declare msg text;
begin
  begin
    execute p_sql;
  exception when others then
    msg := sqlerrm;
  end;
  if msg is null then
    raise exception 'FAIL: % — 오류 없이 실행됨', p_label;
  end if;
  if p_match is not null and position(p_match in msg) = 0 then
    raise exception 'FAIL: % — 다른 오류: %', p_label, msg;
  end if;
  perform tests.pass(p_label);
end $$;

-- 오류 없이 실행돼야 통과
create function tests.lives(p_sql text, p_label text) returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    raise exception 'FAIL: % — 오류: %', p_label, sqlerrm;
  end;
  perform tests.pass(p_label);
end $$;

-- 수정·삭제 문이 바꾼 행 수 (RLS 에 막히면 오류 없이 0건)
create function tests.affects(p_sql text, p_want int, p_label text) returns void language plpgsql as $$
declare n int;
begin
  execute p_sql;
  get diagnostics n = row_count;
  perform tests.eq(n, p_want, p_label);
end $$;
