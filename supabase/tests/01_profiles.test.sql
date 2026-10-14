-- 회원 정보·권한 — 남의 개인정보 조회, 관리자 승격, 프로필 사진 주소 위조
begin;

-- ── 비로그인 (publishable key 만 가진 외부인) ──
select tests.logout();
select tests.eq(tests.count('select * from public.profiles'), 0, '비로그인: 회원 목록(이름·전화번호) 조회 불가');
select tests.eq(tests.count('select * from public.groups'), 0, '비로그인: 그룹·초대코드 조회 불가');
select tests.eq(tests.count('select * from public.group_members'), 0, '비로그인: 그룹 멤버 조회 불가');
select tests.eq(tests.count('select * from public.workouts'), 0, '비로그인: 운동 기록 조회 불가');
select tests.throws(format($$insert into public.profiles (id, nickname) values (%L, 'x')$$, tests.uid('E')),
  'row-level security', '비로그인: 프로필 생성 불가');
select tests.affects($$update public.profiles set nickname = 'hacked'$$, 0, '비로그인: 프로필 수정 0건');

-- ── 로그인 사용자 B ──
select tests.login('B');
select tests.eq(tests.count('select * from public.profiles'), 1, 'B: 프로필은 본인 것만 보임');
select tests.eq(tests.count(format('select * from public.profiles where id = %L', tests.uid('A'))), 0,
  'B: 같은 그룹 A 의 이름·전화번호도 직접 조회 불가');
select tests.eq((select count(*) from public.get_group_profiles(tests.gid('응원반'))), 2::bigint,
  'B: 그룹 화면용 함수로는 같은 그룹 멤버의 닉네임·사진만 조회');
select tests.ok(not exists (
    select 1 from pg_proc p, unnest(p.proargnames) a
    where p.proname = 'get_group_profiles' and a in ('full_name', 'phone')),
  '그룹 멤버 조회 함수는 이름·전화번호 컬럼을 돌려주지 않음');

-- 관리자 승격·비활성 해제 시도 → 오류 없이 원래 값으로 고정
select tests.affects(format($$update public.profiles set role = 'admin', is_active = false where id = %L$$, tests.uid('B')), 1,
  'B: 본인 프로필 수정 자체는 가능');
select tests.eq((select role from public.profiles where id = tests.uid('B')), 'user', 'B: 스스로 관리자 승격 불가');
select tests.eq((select is_active from public.profiles where id = tests.uid('B')), true, 'B: 활성 상태 스스로 변경 불가');
select tests.ok(not public.is_admin(), 'B: 관리자 아님');

-- 남의 프로필
select tests.affects(format($$update public.profiles set nickname = 'hacked' where id = %L$$, tests.uid('A')), 0, 'B: 남의 프로필 수정 0건');
select tests.affects(format($$delete from public.profiles where id = %L$$, tests.uid('A')), 0, 'B: 남의 프로필 삭제 0건');
select tests.throws(format($$insert into public.profiles (id, nickname) values (%L, 'x')$$, tests.uid('E')),
  'row-level security', 'B: 남의 id 로 프로필 생성 불가');

-- 프로필 사진 주소: 본인 avatars 폴더의 스토리지 주소만
select tests.throws(format($$update public.profiles set avatar_url = 'https://evil.example/track.png' where id = %L$$, tests.uid('B')),
  '올바르지 않은 프로필 사진 주소', 'B: 외부 주소를 프로필 사진으로 저장 불가 (접속 IP 노출 방지)');
select tests.throws(format($$update public.profiles set avatar_url = 'https://x.supabase.co/storage/v1/object/public/avatars/%s/avatar.jpg' where id = %L$$,
    tests.uid('A'), tests.uid('B')),
  '올바르지 않은 프로필 사진 주소', 'B: 남의 폴더 사진 주소 저장 불가');
select tests.lives(format($$update public.profiles set avatar_url = 'https://x.supabase.co/storage/v1/object/public/avatars/%s/avatar.jpg?t=1' where id = %L$$,
    tests.uid('B'), tests.uid('B')),
  'B: 본인 폴더 사진 주소는 저장 가능');
select tests.lives(format($$update public.profiles set avatar_url = null where id = %L$$, tests.uid('B')), 'B: 프로필 사진 삭제 가능');

-- ── 가입 직후 E: 관리자로 위장한 프로필 생성 ──
select tests.login('E');
select tests.lives(format($$insert into public.profiles (id, nickname, role, is_active) values (%L, '신입', 'admin', false)$$, tests.uid('E')),
  'E: 본인 프로필 생성 가능');
select tests.eq((select role || '/' || is_active from public.profiles where id = tests.uid('E')), 'user/true',
  'E: 가입 시 관리자·비활성 값은 무시되고 일반·활성으로 시작');
select tests.eq((select age_over_14 from public.profiles where id = tests.uid('E')), false, 'E: 연령 확인 기본값은 미확인');

-- ── 관리자 M ──
select tests.login('M');
select tests.ok(public.is_admin(), 'M: 관리자');
select tests.eq(tests.count('select * from public.profiles'), 5, 'M: 회원 관리 화면에서 전체 회원 조회');
select tests.affects(format($$update public.profiles set is_active = false where id = %L$$, tests.uid('C')), 1, 'M: 회원 비활성 처리');
select tests.eq((select is_active from public.profiles where id = tests.uid('C')), false, 'M: 비활성 처리 반영');

-- ── 운영자 (SQL Editor) ──
select tests.as_operator();
update public.profiles set role = 'admin' where id = tests.uid('B');
select tests.eq((select role from public.profiles where id = tests.uid('B')), 'admin', '운영자: SQL Editor 에서 관리자 지정 가능');

rollback;
