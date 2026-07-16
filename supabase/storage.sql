-- Absolid 사진 저장소 (Day 5) — Supabase SQL Editor에 붙여넣어 실행
-- 인증샷 버킷: 누구나 볼 수 있는 공개 버킷, 업로드는 본인 폴더에만 가능

insert into storage.buckets (id, name, public)
values ('photos', 'photos', true)
on conflict (id) do nothing;

create policy "photos: 본인 폴더 업로드" on storage.objects
  for insert with check (
    bucket_id = 'photos' and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "photos: 본인 폴더 덮어쓰기" on storage.objects
  for update using (
    bucket_id = 'photos' and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "photos: 누구나 조회" on storage.objects
  for select using (bucket_id = 'photos');

create policy "photos: 본인 폴더 삭제" on storage.objects
  for delete using (
    bucket_id = 'photos' and auth.uid()::text = (storage.foldername(name))[1]
  );
