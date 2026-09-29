-- ============================================================
-- Jadwali — notification scheduler (pg_cron -> Edge Function)
--
-- Run AFTER supabase-schema.sql and AFTER deploying the
-- `send-notifications` Edge Function (see supabase/README.md).
--
-- The shared secret is generated inside the database (public.app_private, created
-- by supabase-schema.sql), so nothing needs to be copied or pasted.
-- Paste into the Supabase SQL Editor and run. Safe to re-run.
-- ============================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Remove old versions of these jobs (ignore "does not exist").
do $$
begin
  perform cron.unschedule('jadwali-send-notifications');
exception when others then null;
end $$;

do $$
begin
  perform cron.unschedule('jadwali-prune-notification-log');
exception when others then null;
end $$;

-- Every minute: ask the Edge Function to send anything that is due.
select cron.schedule(
  'jadwali-send-notifications',
  '* * * * *',
  $job$
  select net.http_post(
    url     := 'https://jsjhqahyiwybrlebajbr.supabase.co/functions/v1/send-notifications',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select value from public.app_private where key = 'cron_secret')
    ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 20000
  );
  $job$
);

-- Daily: keep the de-duplication log small.
select cron.schedule(
  'jadwali-prune-notification-log',
  '17 3 * * *',
  $job$ delete from public.notification_log where sent_at < now() - interval '14 days'; $job$
);

-- Verify (run separately):
--   select jobname, schedule, active from cron.job where jobname like 'jadwali-%';
--   select status, return_message, start_time from cron.job_run_details order by start_time desc limit 5;
--   select id, status_code, content::text from net._http_response order by created desc limit 5;
