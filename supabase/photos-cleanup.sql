-- 인증샷 자동 정리용 삭제 권한 — Supabase SQL Editor에서 실행
-- 앱이 30일 지난 본인 인증샷을 삭제할 수 있도록 photos 버킷에 delete 정책 추가

create policy "photos: 본인 폴더 삭제" on storage.objects
  for delete using (
    bucket_id = 'photos' and auth.uid()::text = (storage.foldername(name))[1]
  );
