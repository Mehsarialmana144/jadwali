-- ============================================================
-- Jadwali: notification types v2
--   1. Daily summary          (Profile: on/off + time)         -> notification_settings
--   2. Reminder before a task (per task: on/off + how long)    -> tasks.remind_before_minutes (null = off)
--   3. Notify at task time    (per task: on/off)               -> tasks.notify_at_time
-- Due Soon and Overdue are removed.
--
-- Run in the Supabase SQL Editor in TWO steps so the live app keeps working during the rollout:
--   STEP A (below)  : adds the new columns and copies old settings across. Old columns stay for now.
--   ...deploy the new Edge Function and the new app...
--   STEP D (bottom) : removes the old columns / log kinds. Only run after the new app + function are live.
-- Both steps are safe to re-run.
-- ============================================================

-- ---------------- STEP A: expand ----------------
alter table public.tasks add column if not exists remind_before_minutes integer;
alter table public.tasks add column if not exists notify_at_time boolean not null default false;

alter table public.tasks drop constraint if exists tasks_remind_before_check;
alter table public.tasks add constraint tasks_remind_before_check
  check (remind_before_minutes is null or remind_before_minutes between 1 and 10080);

-- carry over anything set with the old single "reminder" field
do $$
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'tasks' and column_name = 'reminder') then
    update public.tasks set notify_at_time = true where reminder = 'at_time' and notify_at_time = false;
    update public.tasks
       set remind_before_minutes = case reminder when '15m' then 15 when '30m' then 30 when '1h' then 60 when '1d' then 1440 end
     where reminder in ('15m', '30m', '1h', '1d') and remind_before_minutes is null;
  end if;
end $$;

-- the send log accepts the new kinds next to the old ones for now
alter table public.notification_log drop constraint if exists notification_log_kind_check;
alter table public.notification_log add constraint notification_log_kind_check
  check (kind in ('reminder', 'at_time', 'daily_summary', 'due_soon', 'overdue'));


-- ---------------- STEP D: contract (run LAST) ----------------
-- (uncomment and run once the new function and app are live)
--
-- do $$
-- begin
--   if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'tasks' and column_name = 'reminder') then
--     update public.tasks set notify_at_time = true where reminder = 'at_time' and notify_at_time = false;
--     update public.tasks
--        set remind_before_minutes = case reminder when '15m' then 15 when '30m' then 30 when '1h' then 60 when '1d' then 1440 end
--      where reminder in ('15m', '30m', '1h', '1d') and remind_before_minutes is null;
--     alter table public.tasks drop constraint if exists tasks_reminder_check;
--     alter table public.tasks drop column reminder;
--   end if;
-- end $$;
-- alter table public.notification_settings drop column if exists due_soon_enabled;
-- alter table public.notification_settings drop column if exists overdue_enabled;
-- delete from public.notification_log where kind in ('due_soon', 'overdue');
-- alter table public.notification_log drop constraint if exists notification_log_kind_check;
-- alter table public.notification_log add constraint notification_log_kind_check
--   check (kind in ('reminder', 'at_time', 'daily_summary'));
