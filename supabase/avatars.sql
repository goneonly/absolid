-- AbsDay 프로필 사진 — Supabase SQL Editor에 붙여넣어 실행
-- 1) profiles에 avatar_url 컬럼 추가
alter table public.profiles
  add column if not exists avatar_url text;

-- 2) 아바타 버킷: 공개 조회, 업로드/수정/삭제는 본인 폴더에만 가능
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

create policy "avatars: 본인 폴더 업로드" on storage.objects
  for insert with check (
    bucket_id = 'avatars' and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "avatars: 본인 폴더 덮어쓰기" on storage.objects
  for update using (
    bucket_id = 'avatars' and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "avatars: 본인 폴더 삭제" on storage.objects
  for delete using (
    bucket_id = 'avatars' and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "avatars: 누구나 조회" on storage.objects
  for select using (bucket_id = 'avatars');
