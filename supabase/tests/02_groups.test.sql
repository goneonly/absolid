-- 그룹 — 생성 검증, 정원·회원제한 우회, 남의 그룹 엿보기, 그룹장 권한
begin;

-- ── 생성 ──
select tests.login('C');
select tests.throws($$select public.create_group('   ', 5, false)$$, '그룹 이름을 입력해', '빈 그룹 이름 거부');
select tests.throws($$select public.create_group('X', 1, false)$$, '2~50명', '인원 1명 거부');
select tests.throws($$select public.create_group('X', 51, false)$$, '2~50명', '인원 51명 거부');
select tests.throws($$select public.create_group('X', null, false)$$, '2~50명', '인원 미입력 거부');
select tests.lives($$select public.create_group('  C의 그룹  ', 5, null)$$, 'C: 그룹 생성');
select tests.eq((select g.name from public.groups g where g.created_by = tests.uid('C')), 'C의 그룹', '그룹 이름 앞뒤 공백 제거');
select tests.ok((select g.invite_code ~ '^[ABCDEFGHJKMNPQRSTUVWXYZ2-9]{6}$' from public.groups g where g.name = 'C의 그룹'),
  '초대 코드는 헷갈리는 문자(I·L·O·0·1) 없는 6자리');
select tests.eq((select count(*) from public.group_members m where m.group_id = tests.gid('C의 그룹')), 1::bigint, '만든 사람은 자동으로 멤버');
select tests.lives($$select public.create_group(repeat('가', 30), 5, false)$$, '긴 이름도 생성 가능');
select tests.eq((select max(length(g.name)) from public.groups g), 20, '그룹 이름은 20자로 자름');

-- ── 그룹 밖 사람 C ──
select tests.eq(tests.count($$select * from public.groups where name = '응원반'$$), 0, 'C: 남의 그룹·초대코드 조회 불가');
select tests.eq(tests.count(format('select * from public.group_members where group_id = %L', tests.gid('응원반'))), 0, 'C: 남의 그룹 멤버 조회 불가');
select tests.eq((select count(*) from public.get_group_profiles(tests.gid('응원반'))), 0::bigint, 'C: 남의 그룹 멤버 프로필 조회 불가');
select tests.throws(format($$insert into public.groups (name, invite_code, created_by) values ('직접', 'ZZZZZZ', %L)$$, tests.uid('C')),
  'row-level security', 'C: 그룹 직접 생성 불가 (함수로만)');
select tests.throws(format($$insert into public.group_members (group_id, user_id) values (%L, %L)$$, tests.gid('응원반'), tests.uid('C')),
  'row-level security', 'C: 초대 코드 없이 멤버 직접 추가 불가 (정원·회원제한 우회 차단)');
select tests.throws($$select * from public.join_group('NOPE99')$$, '초대 코드를 찾을 수 없어요', '없는 초대 코드 거부');

-- ── 참여 ──
select tests.lives(format($$select * from public.join_group(%L)$$, '  ' || lower(tests.code('응원반')) || ' '), 'C: 소문자·공백 섞인 코드로 참여');
select tests.lives(format($$select * from public.join_group(%L)$$, tests.code('응원반')), 'C: 이미 멤버면 다시 참여해도 무해');
select tests.eq((select count(*) from public.group_members m where m.group_id = tests.gid('응원반')), 3::bigint, '응원반 3/3명');
select tests.login('E');
select tests.throws(format($$select * from public.join_group(%L)$$, tests.code('응원반')), '정원(3명)', 'E: 정원 초과 참여 거부');
select tests.login('C');
select tests.throws(format($$select * from public.join_group(%L)$$, tests.code('회원반')), '이름·전화번호를 등록한 회원만',
  'C: 이름·전화번호 없으면 회원반 참여 거부');
select tests.login('B');
select tests.lives(format($$select * from public.join_group(%L)$$, tests.code('회원반')), 'B: 회원 정보 있으면 회원반 참여');

-- ── 직접 수정·삭제 차단 ──
select tests.login('A');
select tests.affects(format($$update public.groups set max_members = 50, members_only = false where id = %L$$, tests.gid('응원반')), 0,
  'A(그룹장): 그룹 설정 직접 변경 0건');
select tests.affects(format($$delete from public.group_members where group_id = %L and user_id = %L$$, tests.gid('응원반'), tests.uid('B')), 0,
  'A(그룹장): 멤버 강제 삭제 0건');
select tests.login('B');
select tests.affects(format($$delete from public.group_members where user_id = %L$$, tests.uid('B')), 0,
  'B: 직접 탈퇴 0건 (그룹장 위임을 거치도록 함수로만)');
select tests.affects(format($$update public.groups set created_by = %L where id = %L$$, tests.uid('B'), tests.gid('응원반')), 0,
  'B: 그룹장 직접 가로채기 0건');
select tests.throws(format($$select public._handoff_group(%L, %L)$$, tests.gid('응원반'), tests.uid('A')), 'permission denied',
  'B: 내부용 위임 함수 호출 불가');
select tests.throws(format($$select public.handoff_user_groups(%L)$$, tests.uid('A')), 'permission denied',
  'B: 탈퇴 처리 함수 호출 불가 (서버 전용)');

-- ── 그룹 사진 ──
select tests.throws(format($$select public.set_group_photo(%L, null)$$, tests.gid('응원반')), '그룹장만', 'B: 그룹 사진 변경 불가');
select tests.login('A');
select tests.throws(format($$select public.set_group_photo(%L, 'https://evil.example/x.jpg')$$, tests.gid('응원반')),
  '올바르지 않은 사진 주소', 'A: 외부 주소를 그룹 사진으로 저장 불가');
select tests.throws(format($$select public.set_group_photo(%L, 'https://x.supabase.co/storage/v1/object/public/group-photos/%s/photo.jpg')$$,
    tests.gid('응원반'), tests.gid('회원반')),
  '올바르지 않은 사진 주소', 'A: 다른 그룹 폴더 사진 주소 저장 불가');
select tests.lives(format($$select public.set_group_photo(%L, 'https://x.supabase.co/storage/v1/object/public/group-photos/%s/photo.jpg?t=1')$$,
    tests.gid('응원반'), tests.gid('응원반')),
  'A: 이 그룹 폴더 사진은 저장 가능');

-- ── 나가기·그룹장 위임 ──
select tests.eq(public.leave_group(tests.gid('응원반')), false, 'A(그룹장) 나가기: 그룹은 유지');
select tests.as_operator();
select tests.eq((select created_by from public.groups where id = tests.gid('응원반')), tests.uid('B'), '그룹장은 먼저 참여한 B 에게 위임');
select tests.login('A');
select tests.eq(public.leave_group(tests.gid('응원반')), false, '이미 나간 그룹 다시 나가기: 변화 없음');
select tests.throws(format($$select public.set_group_photo(%L, null)$$, tests.gid('응원반')), '그룹장만', '나간 전 그룹장 A: 그룹 사진 변경 불가');
select tests.login('B');
select tests.lives(format($$select public.set_group_photo(%L, null)$$, tests.gid('응원반')), '새 그룹장 B: 그룹 사진 변경 가능');

select tests.login('C');
select tests.eq(public.leave_group(tests.gid('C의 그룹')), true, '마지막 멤버가 나가면 그룹 삭제');
select tests.as_operator();
select tests.eq((select count(*) from public.groups where name = 'C의 그룹'), 0::bigint, '빈 그룹이 남지 않음');

-- ── 회원 탈퇴 처리 (Edge Function 의 service_role) ──
select tests.as_service();
select tests.lives(format($$select public.handoff_user_groups(%L)$$, tests.uid('B')), '서버: 탈퇴자 그룹 정리 함수 실행 가능');
select tests.as_operator();
select tests.eq((select created_by from public.groups where id = tests.gid('응원반')), tests.uid('C'), '탈퇴한 그룹장 B → 남은 C 에게 위임');
select tests.eq((select count(*) from public.group_members where user_id = tests.uid('B')), 0::bigint, '탈퇴자는 모든 그룹에서 빠짐');

rollback;
