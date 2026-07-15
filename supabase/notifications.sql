-- 미운동 리마인더 알림 (v0.4)
-- Supabase SQL Editor에 붙여넣어 실행하세요.
-- 포함: 브라우저 푸시 구독 저장 테이블 + RLS

-- ── 푸시 구독 ────────────────────────────────
-- 한 사용자가 여러 기기(브라우저)에서 구독할 수 있어 endpoint별로 저장
create table if not exists public.push_subscriptions (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);
alter table public.push_subscriptions enable row level security;

-- 재실행해도 오류가 나지 않도록 기존 정책을 지우고 다시 생성 (멱등)
drop policy if exists "push: 본인 조회" on public.push_subscriptions;
drop policy if exists "push: 본인 등록" on public.push_subscriptions;
drop policy if exists "push: 본인 수정" on public.push_subscriptions;
drop policy if exists "push: 본인 삭제" on public.push_subscriptions;

create policy "push: 본인 조회" on public.push_subscriptions
  for select using (auth.uid() = user_id);
create policy "push: 본인 등록" on public.push_subscriptions
  for insert with check (auth.uid() = user_id);
create policy "push: 본인 수정" on public.push_subscriptions
  for update using (auth.uid() = user_id);
create policy "push: 본인 삭제" on public.push_subscriptions
  for delete using (auth.uid() = user_id);

-- ── 크론 스케줄 (선택) ────────────────────────
-- Edge Function(send-reminders)을 매일 저녁 8시(KST, UTC 11시)에 호출합니다.
-- 사용 전 Dashboard > Database > Extensions 에서 pg_cron, pg_net 활성화 후
-- 아래 주석을 풀고 <PROJECT_REF>, <SERVICE_ROLE_KEY 또는 CRON_SECRET>을 채워 실행하세요.
--
-- select cron.schedule(
--   'absolid-workout-reminder',
--   '0 11 * * *',  -- UTC 11:00 = KST 20:00
--   $$
--   select net.http_post(
--     url := 'https://<PROJECT_REF>.supabase.co/functions/v1/send-reminders',
--     headers := jsonb_build_object(
--       'Content-Type', 'application/json',
--       'Authorization', 'Bearer <SERVICE_ROLE_KEY>'
--     ),
--     body := '{}'::jsonb
--   );
--   $$
-- );
