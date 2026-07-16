-- 운동 기록 초기화에 필요한 삭제 정책 — Supabase SQL Editor에 붙여넣어 실행
-- (여러 번 실행해도 오류 없음)

-- 본인 운동 기록 삭제 허용
drop policy if exists "workouts: 본인 삭제" on public.workouts;
create policy "workouts: 본인 삭제" on public.workouts
  for delete using (auth.uid() = user_id);

-- 본인 인증샷 삭제 허용 (30일 지난 사진 자동 정리에도 필요)
drop policy if exists "photos: 본인 폴더 삭제" on storage.objects;
create policy "photos: 본인 폴더 삭제" on storage.objects
  for delete using (
    bucket_id = 'photos' and auth.uid()::text = (storage.foldername(name))[1]
  );
