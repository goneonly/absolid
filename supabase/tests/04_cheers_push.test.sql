-- 응원·푸시 구독 — 그룹 밖 응원, 응원 위조·도배, 남의 알림 구독 가로채기
begin;

create temp table ctx (k text primary key, v uuid);
grant select, insert on ctx to authenticated;

-- B 는 오늘 운동 완료 / A 는 아직
select tests.login('B');
insert into ctx values ('s', public.start_workout(60));
select tests.as_operator();
update public.workout_sessions set started_at = now() - interval '2 minutes' where id = (select v from ctx where k = 's');
select tests.login('B');
select tests.lives(format('select public.complete_workout(%L)', (select v from ctx where k = 's')), 'B: 오늘 운동 완료');

-- ── 응원 보내기 ──
select tests.login('A');
select tests.ok(public.send_cheer(tests.gid('응원반'), tests.uid('B')) is not null, 'A → B 응원');
select tests.eq((select kind from public.cheers where from_user = tests.uid('A')), 'done', '운동한 사람에게는 👏(done) — 서버가 판단');
select tests.ok(public.send_cheer(tests.gid('응원반'), tests.uid('B')) is null, '같은 사람에게 하루 두 번 응원 불가 (알림 도배 방지)');
select tests.login('B');
select tests.ok(public.send_cheer(tests.gid('응원반'), tests.uid('A')) is not null, 'B → A 응원');
select tests.eq((select kind from public.cheers where from_user = tests.uid('B')), 'nudge', '아직 안 한 사람에게는 💪(nudge)');
select tests.throws(format('select public.send_cheer(%L, %L)', tests.gid('응원반'), tests.uid('B')), '자기 자신', '자기 자신 응원 불가');
select tests.throws(format('select public.send_cheer(%L, %L)', tests.gid('응원반'), tests.uid('C')), '같은 그룹 멤버만', '그룹 밖 사람에게 응원 불가');
select tests.throws(format('select public.send_cheer(%L, %L)', tests.gid('회원반'), tests.uid('A')), '같은 그룹 멤버만',
  '내가 속하지 않은 그룹 이름으로 응원 불가');

select tests.login('C');
select tests.throws(format('select public.send_cheer(%L, %L)', tests.gid('응원반'), tests.uid('A')), '같은 그룹 멤버만', 'C: 그룹 밖에서 응원 불가');
select tests.eq(tests.count('select * from public.cheers'), 0, 'C: 남의 그룹 응원 조회 불가');
select tests.eq((select count(*) from public.my_received_cheers()), 0::bigint, 'C: 받은 응원 없음');
select tests.throws(format($$insert into public.cheers (group_id, from_user, to_user, date, kind) values (%L, %L, %L, current_date + 1, 'done')$$,
    tests.gid('응원반'), tests.uid('A'), tests.uid('B')),
  'row-level security', 'C: 남의 이름으로 응원 위조 불가');
select tests.logout();
select tests.throws(format('select public.send_cheer(%L, %L)', tests.gid('응원반'), tests.uid('A')), '로그인이 필요해요', '비로그인: 응원 불가');
select tests.eq(tests.count('select * from public.cheers'), 0, '비로그인: 응원 조회 불가');

-- ── 받은 응원 ──
select tests.login('A');
select tests.eq(tests.count('select * from public.cheers'), 2, 'A: 같은 그룹 응원 2건 조회 (그룹 화면 응원 수)');
select tests.eq((select from_nickname || '/' || kind || '/' || group_name from public.my_received_cheers()), '서연/nudge/응원반',
  'A: 오늘 받은 응원 — 보낸 사람 닉네임만 (이름·전화번호 없음)');
select tests.affects('delete from public.cheers', 0, 'A: 응원 기록 삭제 0건');
select tests.affects($$update public.cheers set kind = 'done', notified_at = null$$, 0, 'A: 응원 기록 수정 0건 (알림 재발송 조작 방지)');

-- ── 푸시 구독 ──
select tests.logout();
select tests.throws($$select public.register_push('https://push.example/1', 'k', 'a')$$, '로그인이 필요해요', '비로그인: 알림 구독 등록 불가');
select tests.login('B');
select tests.lives($$select public.register_push('https://push.example/1', 'k', 'a')$$, 'B: 이 기기 알림 등록');
select tests.eq(tests.count('select * from public.push_subscriptions'), 1, 'B: 본인 구독 조회');
select tests.login('A');
select tests.eq(tests.count('select * from public.push_subscriptions'), 0, 'A: 남의 구독 조회 불가');
select tests.lives($$select public.register_push('https://push.example/1', 'k2', 'a2')$$, '같은 기기에서 A 로 계정을 바꿔 알림 등록');
select tests.eq(tests.count('select * from public.push_subscriptions'), 1, 'A: 이 기기 알림은 이제 A 에게');
select tests.login('B');
select tests.eq(tests.count('select * from public.push_subscriptions'), 0, 'B: 계정을 바꾼 기기의 알림은 더 이상 안 옴');

select tests.login('C');
select tests.throws(format($$insert into public.push_subscriptions (user_id, endpoint, p256dh, auth) values (%L, 'https://push.example/c', 'k', 'a')$$,
    tests.uid('A')),
  'row-level security', 'C: 남의 계정으로 구독 등록 불가');
select tests.affects($$update public.push_subscriptions set endpoint = 'https://evil.example'$$, 0, 'C: 남의 구독 주소 바꿔치기 0건');
select tests.affects('delete from public.push_subscriptions', 0, 'C: 남의 구독 삭제 0건');

select tests.as_operator();
select tests.eq((select count(*) from public.push_subscriptions), 1::bigint, '같은 기기 구독은 1건으로 유지');

rollback;
