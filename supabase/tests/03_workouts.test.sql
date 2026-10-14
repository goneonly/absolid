-- 운동 기록 — 영상 안 보고 완료, 남의 세션 사용, 과거 날짜 위조, 남의 기록 수정
-- (테스트는 한 트랜잭션 안이라 now() 가 고정 → 시청 경과 시간은 운영자가 started_at 을 당겨서 재현)
begin;

create temp table ctx (k text primary key, v uuid);
grant select, insert on ctx to authenticated;

-- ── 직접 기록 차단 ──
select tests.login('B');
select tests.throws(format($$insert into public.workouts (user_id, date, day) values (%L, (now() at time zone 'Asia/Seoul')::date, 1)$$, tests.uid('B')),
  'row-level security', 'B: 운동 기록 직접 생성 불가 (영상 시청 검증 함수로만)');
select tests.throws(format('select public.complete_workout(%L)', gen_random_uuid()), '시청 기록을 찾을 수 없어요', '없는 시청 세션으로 완료 불가');
select tests.eq(tests.count('select * from public.workout_sessions'), 0, 'B: 시청 세션 테이블 직접 조회 불가');

-- ── 10분 영상 시청 → 80%(8분) 지나야 기록 ──
insert into ctx values ('s', public.start_workout(600));
select tests.throws(format('select public.complete_workout(%L)', (select v from ctx where k = 's')),
  '약 8분 남았어요', '시작 직후 완료 → 남은 시간 안내 (약 8분)');

select tests.as_operator();
update public.workout_sessions set started_at = now() - interval '350 seconds' where id = (select v from ctx where k = 's');
select tests.login('B');
select tests.throws(format('select public.complete_workout(%L)', (select v from ctx where k = 's')),
  '약 3분 남았어요', '5분 50초 경과 → 2분 10초 남음은 약 3분으로 올림');

select tests.as_operator();
update public.workout_sessions set started_at = now() - interval '435 seconds' where id = (select v from ctx where k = 's');
select tests.login('C');
select tests.throws(format('select public.complete_workout(%L)', (select v from ctx where k = 's')),
  '시청 기록을 찾을 수 없어요', 'C: 남의 시청 세션으로 완료 불가');
select tests.login('B');
select tests.throws(format('select public.complete_workout(%L)', (select v from ctx where k = 's')),
  '45초 남았어요', '7분 15초 경과 → 45초 남음');

select tests.as_operator();
update public.workout_sessions set started_at = now() - interval '481 seconds' where id = (select v from ctx where k = 's');
select tests.login('B');
select tests.eq(public.complete_workout((select v from ctx where k = 's')), (now() at time zone 'Asia/Seoul')::date,
  '8분 1초 경과 → 오늘(한국 시간)로 기록');
select tests.eq((select day from public.workouts where user_id = tests.uid('B')),
  least(extract(day from (now() at time zone 'Asia/Seoul')::date)::int, 30), 'Day 번호는 서버가 날짜로 계산');
select tests.lives(format('select public.complete_workout(%L)', (select v from ctx where k = 's')), '같은 세션 다시 완료해도 무해');
select tests.eq(tests.count(format('select * from public.workouts where user_id = %L', tests.uid('B'))), 1, '하루 기록은 1건');

-- ── 영상 길이 보정·오래된 세션 ──
insert into ctx values ('short', public.start_workout(5)), ('long', public.start_workout(999999)), ('old', public.start_workout(600));
select tests.as_operator();
select tests.eq((select video_seconds from public.workout_sessions where id = (select v from ctx where k = 'short')), 60, '영상 길이를 짧게 속여도 최소 60초');
select tests.eq((select video_seconds from public.workout_sessions where id = (select v from ctx where k = 'long')), 3600, '영상 길이 최대 3600초');
update public.workout_sessions set started_at = now() - interval '2 days' where id = (select v from ctx where k = 'old');
select tests.login('B');
select tests.throws(format('select public.complete_workout(%L)', (select v from ctx where k = 'old')),
  '너무 오래돼', '하루 넘은 시청 세션으로 완료 불가');

-- ── 기록 수정 ──
select tests.throws(format($$update public.workouts set date = date - 3 where user_id = %L$$, tests.uid('B')),
  '오늘 또는 어제', 'B: 기록 날짜를 과거로 옮겨 연속 기록 부풀리기 불가');
select tests.affects(format($$update public.workouts set day = 1 where user_id = %L$$, tests.uid('B')), 1, 'B: 본인 기록 수정');
select tests.eq((select day from public.workouts where user_id = tests.uid('B')),
  least(extract(day from (now() at time zone 'Asia/Seoul')::date)::int, 30), 'B: Day 번호를 바꿔도 서버 계산값 유지');
select tests.affects(format($$update public.workouts set photo_url = %L where user_id = %L$$, tests.uid('B') || '/x.jpg', tests.uid('B')), 1,
  'B: 인증샷 연결 가능');
select tests.affects(format($$update public.workouts set photo_url = 'x' where user_id = %L$$, tests.uid('A')), 0, 'B: 남의 기록 수정 0건');
select tests.affects(format($$delete from public.workouts where user_id = %L$$, tests.uid('A')), 0, 'B: 남의 기록 삭제 0건');

-- ── 조회 범위 ──
select tests.eq(tests.count(format('select * from public.workouts where user_id = %L', tests.uid('A'))), 1, 'B: 같은 그룹 A 의 기록 조회 가능');
select tests.login('C');
select tests.eq(tests.count('select * from public.workouts'), 0, 'C: 그룹 밖 사람 기록 조회 불가');
select tests.login('M');
select tests.eq(tests.count('select * from public.workouts'), 2, 'M(관리자): 전체 기록 조회');

-- ── 운영자: 과거 기록 복구 가능 ──
select tests.as_operator();
select tests.lives(format($$insert into public.workouts (user_id, date, day) values (%L, '2026-01-31', 1)$$, tests.uid('C')),
  '운영자: 과거 날짜 기록 추가 가능');
select tests.eq((select day from public.workouts where user_id = tests.uid('C')), 30, '31일 기록은 Day 30');

-- ── 초기화 ──
select tests.login('B');
select tests.affects(format($$delete from public.workouts where user_id = %L$$, tests.uid('B')), 1, 'B: 본인 기록 초기화');

rollback;
