-- 매일 저녁 8시(KST) 미운동 리마인더 자동 발송 — Supabase SQL Editor에서 실행 (재실행 안전)
-- 선행: Dashboard → Database → Extensions 에서 pg_cron, pg_net 켜기
--       send-reminders 함수 배포 + CRON_SECRET 시크릿 등록 (docs/NOTIFICATIONS_SETUP.md)
-- 아래 <CRON_SECRET> 한 곳을 시크릿으로 등록한 값과 똑같이 바꿔서 실행하세요.

-- 크론에서 쓸 비밀값을 Vault 에 보관 (SQL 기록에 평문으로 남지 않게)
select vault.create_secret('<CRON_SECRET>', 'absolid_cron_secret')
where not exists (select 1 from vault.secrets where name = 'absolid_cron_secret');

-- 이미 등록돼 있으면 지우고 다시 등록
select cron.unschedule('absolid-workout-reminder')
where exists (select 1 from cron.job where jobname = 'absolid-workout-reminder');

select cron.schedule(
  'absolid-workout-reminder',
  '0 11 * * *',  -- UTC 11:00 = KST 20:00
  $$
  select net.http_post(
    url := 'https://pqxtzuomckmroqjjkjdq.supabase.co/functions/v1/send-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'absolid_cron_secret')
    ),
    body := '{}'::jsonb
  );
  $$
);
