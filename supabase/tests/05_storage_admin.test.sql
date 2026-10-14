-- 사진 저장소·관리자 기능 — 남의 인증샷 열람·덮어쓰기, 관리자 기능 무단 사용
begin;

-- ── 버킷 설정 ──
select tests.eq((select public from storage.buckets where id = 'photos'), false, '인증샷 버킷은 비공개 (signed URL 로만 열람)');
select tests.eq((select count(*) from storage.buckets where id in ('photos', 'avatars', 'group-photos')
    and file_size_limit = 5 * 1024 * 1024 and allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']), 3::bigint,
  '사진 버킷 3개: 5MB·이미지 형식 제한');

-- ── 인증샷 열람 ──
select tests.logout();
select tests.eq(tests.count($$select * from storage.objects where bucket_id = 'photos'$$), 0, '비로그인: 인증샷 열람 불가');
select tests.eq(tests.count($$select * from storage.objects where bucket_id = 'avatars'$$), 1, '비로그인: 프로필 사진은 공개');
select tests.login('B');
select tests.eq(tests.count(format($$select * from storage.objects where bucket_id = 'photos' and name like '%s/%%'$$, tests.uid('A'))), 1,
  'B: 같은 그룹 A 의 인증샷 열람 가능');
select tests.eq(tests.count(format($$select * from storage.objects where bucket_id = 'photos' and name like '%s/%%'$$, tests.uid('C'))), 0,
  'B: 그룹 밖 C 의 인증샷 열람 불가');
select tests.login('C');
select tests.eq(tests.count($$select * from storage.objects where bucket_id = 'photos'$$), 1, 'C: 본인 인증샷만 보임');
select tests.login('M');
select tests.eq(tests.count($$select * from storage.objects where bucket_id = 'photos'$$), 2, 'M(관리자): 신고 처리용 전체 인증샷 열람');

-- ── 업로드·덮어쓰기·삭제 ──
select tests.login('B');
select tests.throws(format($$insert into storage.objects (bucket_id, name) values ('photos', '%s/2026-10-02.jpg')$$, tests.uid('A')),
  'row-level security', 'B: 남의 폴더에 인증샷 업로드 불가');
select tests.lives(format($$insert into storage.objects (bucket_id, name) values ('photos', '%s/2026-10-02.jpg')$$, tests.uid('B')),
  'B: 본인 폴더 업로드 가능');
select tests.affects(format($$update storage.objects set metadata = '{}' where name like '%s/%%'$$, tests.uid('A')), 0, 'B: 남의 사진 덮어쓰기 0건');
select tests.affects(format($$delete from storage.objects where name like '%s/%%'$$, tests.uid('A')), 0, 'B: 남의 사진·프로필 사진 삭제 0건');
select tests.throws(format($$insert into storage.objects (bucket_id, name) values ('avatars', '%s/avatar.jpg')$$, tests.uid('A')),
  'row-level security', 'B: 남의 프로필 사진 폴더 업로드 불가');
select tests.throws(format($$insert into storage.objects (bucket_id, name) values ('group-photos', '%s/new.jpg')$$, tests.gid('응원반')),
  'row-level security', 'B(멤버): 그룹 사진 업로드 불가 — 그룹장만');
select tests.affects($$delete from storage.objects where bucket_id = 'group-photos'$$, 0, 'B(멤버): 그룹 사진 삭제 0건');
select tests.login('A');
select tests.lives(format($$insert into storage.objects (bucket_id, name) values ('group-photos', '%s/new.jpg')$$, tests.gid('응원반')),
  'A(그룹장): 그룹 사진 업로드 가능');
select tests.login('M');
select tests.affects(format($$delete from storage.objects where bucket_id = 'photos' and name like '%s/%%'$$, tests.uid('C')), 1,
  'M(관리자): 신고된 인증샷 삭제 가능');

-- ── 관리자 기능 ──
select tests.login('B');
select tests.throws('select public.admin_stats()', '관리자만', 'B: 관리자 통계 조회 불가');
select tests.throws($$insert into public.announcements (message) values ('가짜 공지')$$, 'row-level security', 'B: 공지 작성 불가');
select tests.affects($$update public.app_config set value = 'evil' where key = 'playlist_id'$$, 0, 'B: 운동 영상 목록 변경 0건');
select tests.throws($$insert into public.app_config (key, value) values ('new_key', 'x')$$, 'row-level security', 'B: 앱 설정 추가 불가');
select tests.throws(format($$insert into public.reports (reporter_id, target_user_id, target_date) values (%L, %L, current_date)$$,
    tests.uid('A'), tests.uid('C')),
  'row-level security', 'B: 남의 이름으로 신고 불가');
select tests.lives(format($$insert into public.reports (reporter_id, target_user_id, target_date, reason) values (%L, %L, current_date, '부적절')$$,
    tests.uid('B'), tests.uid('A')),
  'B: 인증샷 신고 가능');
select tests.eq(tests.count('select * from public.reports'), 0, 'B: 신고 목록 조회 불가 (누가 신고했는지 비공개)');

select tests.login('M');
select tests.lives('select public.admin_stats()', 'M: 관리자 통계 조회');
select tests.eq((public.admin_stats() ->> 'total_users')::int, 4, 'M: 통계 — 회원 수');
select tests.eq((public.admin_stats() ->> 'pending_reports')::int, 1, 'M: 통계 — 처리 대기 신고');
select tests.lives($$insert into public.announcements (message) values ('점검 안내')$$, 'M: 공지 작성');
select tests.affects($$update public.reports set status = 'resolved'$$, 1, 'M: 신고 처리');

select tests.logout();
select tests.eq(tests.count('select * from public.announcements where active'), 1, '비로그인: 공지 조회 가능');
select tests.eq(tests.count($$select * from public.app_config where key = 'playlist_id'$$), 1, '비로그인: 운동 영상 목록 조회 가능');
select tests.throws('select public.admin_stats()', '관리자만', '비로그인: 관리자 통계 불가');

rollback;
