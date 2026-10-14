-- 테스트 데이터 — 모든 테스트 파일이 이 상태에서 시작 (각 파일은 끝에서 rollback)
select tests.as_operator();

insert into auth.users (id, email) select id, lower(name) || '@test.local' from tests.users;
insert into public.profiles (id, nickname, full_name, phone) values
  (tests.uid('A'), '민준', '김민준', '010-1111-1111'),
  (tests.uid('B'), '서연', '이서연', '010-2222-2222'),
  (tests.uid('C'), '외부인', '', ''),
  (tests.uid('M'), '관리자', '', '');
update public.profiles set role = 'admin' where id = tests.uid('M'); -- SQL Editor 에서 관리자 지정

-- A: 응원반(3명) · 회원반(2명, 회원만) 생성 / B: 응원반 참여
select tests.login('A');
select name from public.create_group('응원반', 3, false);
select name from public.create_group('회원반', 2, true);
select tests.login('B');
select name from public.join_group(tests.code('응원반'));

-- 지난 기록·사진 (운영자만 과거 날짜를 넣을 수 있음)
select tests.as_operator();
insert into public.workouts (user_id, date, day)
values (tests.uid('A'), (now() at time zone 'Asia/Seoul')::date - 10, 1);
insert into storage.objects (bucket_id, name) values
  ('photos', tests.uid('A') || '/2026-10-01.jpg'),
  ('photos', tests.uid('C') || '/2026-10-01.jpg'),
  ('avatars', tests.uid('A') || '/avatar.jpg'),
  ('group-photos', tests.gid('응원반') || '/photo.jpg');
