-- Absolid v0.6 — 보안·무결성 보강
-- Supabase SQL Editor에서 실행 (재실행 안전)
-- 선행: v0.5-groups-and-fixes.sql 까지 실행되어 있어야 함
--
-- 포함:
--   1) 운동 기록 날짜 제한 — 오늘·어제(한국 시간)만 저장, Day 번호는 서버가 날짜로 계산
--   2) 프로필 사진 주소 제한 — 본인 avatars 폴더의 스토리지 주소만 허용
--   3) 사진 업로드 크기·형식 제한 — 버킷별 5MB, 이미지 파일만
--   4) 쓰지 않는 공개 함수 삭제 — find_group_by_invite_code, group_member_count
--
-- 운영자 작업(SQL Editor·service_role, auth.uid() 없음)과 관리자는 1)·2) 제한에서 제외

-- ══════════════════════════════════════════════
-- 1) 운동 기록 날짜 제한
-- ══════════════════════════════════════════════
-- 문제: API 를 직접 호출하면 본인 계정에 과거 날짜 기록을 마음대로 추가해 streak·리더보드를 부풀릴 수 있었음.
-- 해결: 새 기록(또는 날짜를 바꾸는 수정)은 한국 시간 기준 오늘·어제만 허용.
--       날짜가 그대로인 수정(인증샷 연결·정리 등)은 과거 기록이어도 허용.
create or replace function public.guard_workout_date()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  today date := (now() at time zone 'Asia/Seoul')::date;
begin
  -- Day 번호는 클라이언트 값 대신 날짜로 계산 (31일 → Day 30)
  new.day := least(extract(day from new.date)::int, 30);

  if auth.uid() is null or public.is_admin() then
    return new;
  end if;
  if (tg_op = 'INSERT' or new.date is distinct from old.date)
     and new.date not between today - 1 and today then
    raise exception '운동 기록은 오늘 또는 어제 날짜만 저장할 수 있어요.';
  end if;
  return new;
end $$;

drop trigger if exists trg_guard_workout_date on public.workouts;
create trigger trg_guard_workout_date
  before insert or update on public.workouts
  for each row execute function public.guard_workout_date();

-- ══════════════════════════════════════════════
-- 2) 프로필 사진 주소 제한
-- ══════════════════════════════════════════════
-- 문제: avatar_url 에 임의 외부 주소를 넣으면 그룹 멤버 화면에서 그 주소로 이미지 요청이 나감(접속 IP 노출).
-- 해결: 바뀌는 경우에만 검사 — null 또는 본인 avatars 폴더의 공개 스토리지 주소만 허용.
create or replace function public.guard_profile_avatar()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or public.is_admin() then
    return new;
  end if;
  if new.avatar_url is not null
     and (tg_op = 'INSERT' or new.avatar_url is distinct from old.avatar_url)
     and new.avatar_url not like '%/storage/v1/object/public/avatars/' || new.id::text || '/%' then
    raise exception '올바르지 않은 프로필 사진 주소예요.';
  end if;
  return new;
end $$;

drop trigger if exists trg_guard_profile_avatar on public.profiles;
create trigger trg_guard_profile_avatar
  before insert or update on public.profiles
  for each row execute function public.guard_profile_avatar();

-- ══════════════════════════════════════════════
-- 3) 사진 업로드 크기·형식 제한
-- ══════════════════════════════════════════════
-- 앱은 사진을 압축(긴 변 512~720px JPEG, 보통 수백 KB)해서 올리므로 5MB 면 넉넉함.
update storage.buckets
set file_size_limit = 5 * 1024 * 1024,
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']
where id in ('photos', 'avatars', 'group-photos');

-- ══════════════════════════════════════════════
-- 4) 쓰지 않는 공개 함수 삭제
-- ══════════════════════════════════════════════
-- 그룹 참여는 join_group 하나로 처리 — 아래 두 함수는 로그인 없이 호출 가능한데 앱에서 쓰지 않음.
drop function if exists public.find_group_by_invite_code(text);
drop function if exists public.group_member_count(uuid);
