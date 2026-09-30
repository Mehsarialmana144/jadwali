# Jadwali push notifications: setup

## How it works

```
Profile → Enable ─► service worker + push subscription ─► push_subscriptions (Supabase)
pg_cron (every minute) ─► Edge Function `send-notifications`
    reads tasks + notification_settings, computes what is due in each user's timezone,
    inserts into notification_log (unique key = no duplicates), then sends Web Push
    to FCM / Mozilla / Apple.
```

## One-time setup

1. **Database:** run the `NOTIFICATIONS (Web Push)` section of `supabase-schema.sql` in the Supabase SQL Editor (idempotent). It also generates the scheduler's shared secret inside the database (`public.app_private`), so nothing needs to be copied around.
2. **Edge Function:** deploy `send-notifications`.
   - Dashboard: Edge Functions → Deploy a new function → Via Editor, paste `supabase/deploy/send-notifications.single.ts`, name it `send-notifications`. That file is generated: after changing anything in `functions/send-notifications/`, run `npm run build:function` and paste the result again (`npm run test:function` runs the tests).
   - Or CLI: `supabase functions deploy send-notifications --no-verify-jwt`.
3. **Function settings:** turn **off** "Verify JWT with legacy secret" (Edge Functions → send-notifications → Settings). The function does its own auth: a shared secret from the database for the cron job, and the user's JWT for the "Send test" button. With the switch on, the gateway rejects the cron call with 401.
4. **Function secrets** (Edge Functions → Secrets, or `supabase secrets set --env-file supabase/functions/.secrets.env`): `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`. The values are in `supabase/functions/.secrets.env` (git-ignored).
5. **Scheduler:** run `supabase-notifications-cron.sql` in the SQL Editor (safe to re-run).
6. **Vercel:** set `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` and `VITE_VAPID_PUBLIC_KEY` (same value as in `.env`) for Production, then deploy the code.

## Verify

```sql
select jobname, schedule, active from cron.job where jobname like 'jadwali-%';
select status, return_message, start_time from cron.job_run_details order by start_time desc limit 5;
select id, status_code, content::text from net._http_response order by created desc limit 5;  -- expect 200
select kind, dedupe_key, sent_at from notification_log order by sent_at desc limit 10;
```

Then in the app: Profile → Enable notifications → Send test.

## iPhone

Push works only for the app added to the Home Screen (iOS/iPadOS 16.4+): Safari → Share → Add to Home Screen, open it from the Home Screen, then enable notifications in Profile. It needs HTTPS (your Vercel URL), not `localhost`.

## Tests

`node supabase/functions/send-notifications/test.ts` runs the timing, dedupe, retry and pruning tests (no database or network needed).

## Behaviour notes

- Tasks with a date but no time count as due at **9:00 AM** local time.
- A trigger is only sent within 3 hours of when it should have fired, so a delayed run never sends stale alerts and enabling notifications doesn't flood you with old overdue tasks.
- Editing a task's date, time or reminder creates a new dedupe key, so it will notify again for the new schedule.
- Signing out removes this device's subscription (shared-device privacy), so re-enable after signing back in.

## Daily summary

Title "Good morning, are you ready?"; body is today's open tasks (due today, not done) separated by commas: timed tasks first by time, then by priority, cut off with "+N more" when long. Nothing is sent when nothing is due today. Tapping it opens the Dashboard.
