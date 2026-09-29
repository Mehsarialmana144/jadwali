-- ============================================================
-- Jadwali — Personal Multi-Company Work Planner
-- Supabase SQL Schema
-- Paste this entire file into the Supabase SQL Editor and run it.
-- Safe to run multiple times against a fresh OR an existing
-- Jadwali database (all statements are idempotent).
-- ============================================================

-- Enable pgcrypto for gen_random_uuid()
create extension if not exists "pgcrypto";


-- ============================================================
-- CLEANUP: Exams and Interviews are no longer part of Jadwali,
-- and profiles no longer carry university/major fields.
-- Safe to run even if these were never created.
-- ============================================================
drop table if exists public.exams cascade;
drop table if exists public.interviews cascade;

alter table if exists public.profiles drop column if exists university;
alter table if exists public.profiles drop column if exists major;


-- ============================================================
-- TABLE: profiles
-- Automatically created when a new user signs up (see trigger below).
-- ============================================================
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  full_name   text,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);


-- ============================================================
-- TABLE: companies
-- A user's companies/employers. "My Companies" lives in Profile.
-- ============================================================
create table if not exists public.companies (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  name           text not null,
  logo_url       text,
  position_title text,
  notes          text,
  created_at     timestamptz default now(),
  updated_at     timestamptz default now()
);

-- Additive migration for Jadwali databases created before logo/position existed.
alter table public.companies add column if not exists logo_url text;
alter table public.companies add column if not exists position_title text;
alter table public.companies add column if not exists accent_color text;


-- ============================================================
-- TABLE: tasks
-- The core of Jadwali. Optionally linked to a company.
-- ============================================================
create table if not exists public.tasks (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  title       text not null,
  due_date    date,
  due_time    time,
  category    text check (category in ('university', 'interview', 'project', 'personal', 'other')),
  priority    text check (priority in ('low', 'medium', 'high')),
  status      text check (status in ('todo', 'in_progress', 'done')) default 'todo',
  notes       text,
  company_id  uuid references public.companies(id) on delete set null,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

-- Additive migration for Jadwali databases created before companies existed.
alter table public.tasks add column if not exists company_id uuid references public.companies(id) on delete set null;


-- ============================================================
-- INDEXES — for faster user-specific queries
-- ============================================================
create index if not exists companies_user_id_idx  on public.companies (user_id);

create index if not exists tasks_user_id_idx      on public.tasks (user_id);
create index if not exists tasks_due_date_idx     on public.tasks (due_date);
create index if not exists tasks_company_id_idx   on public.tasks (company_id);


-- ============================================================
-- ROW LEVEL SECURITY — enable on all tables
-- ============================================================
alter table public.profiles  enable row level security;
alter table public.companies enable row level security;
alter table public.tasks     enable row level security;


-- ============================================================
-- RLS POLICIES — profiles
-- (dropped and recreated so this script is safe to re-run)
-- ============================================================
drop policy if exists "profiles: select own" on public.profiles;
create policy "profiles: select own"
  on public.profiles for select
  using (auth.uid() = id);

drop policy if exists "profiles: insert own" on public.profiles;
create policy "profiles: insert own"
  on public.profiles for insert
  with check (auth.uid() = id);

drop policy if exists "profiles: update own" on public.profiles;
create policy "profiles: update own"
  on public.profiles for update
  using (auth.uid() = id);

drop policy if exists "profiles: delete own" on public.profiles;
create policy "profiles: delete own"
  on public.profiles for delete
  using (auth.uid() = id);


-- ============================================================
-- RLS POLICIES — companies
-- ============================================================
drop policy if exists "companies: select own" on public.companies;
create policy "companies: select own"
  on public.companies for select
  using (auth.uid() = user_id);

drop policy if exists "companies: insert own" on public.companies;
create policy "companies: insert own"
  on public.companies for insert
  with check (auth.uid() = user_id);

drop policy if exists "companies: update own" on public.companies;
create policy "companies: update own"
  on public.companies for update
  using (auth.uid() = user_id);

drop policy if exists "companies: delete own" on public.companies;
create policy "companies: delete own"
  on public.companies for delete
  using (auth.uid() = user_id);


-- ============================================================
-- RLS POLICIES — tasks
-- ============================================================
drop policy if exists "tasks: select own" on public.tasks;
create policy "tasks: select own"
  on public.tasks for select
  using (auth.uid() = user_id);

drop policy if exists "tasks: insert own" on public.tasks;
create policy "tasks: insert own"
  on public.tasks for insert
  with check (auth.uid() = user_id);

drop policy if exists "tasks: update own" on public.tasks;
create policy "tasks: update own"
  on public.tasks for update
  using (auth.uid() = user_id);

drop policy if exists "tasks: delete own" on public.tasks;
create policy "tasks: delete own"
  on public.tasks for delete
  using (auth.uid() = user_id);


-- ============================================================
-- TRIGGER: handle_updated_at
-- Automatically updates the updated_at column on any row update.
-- ============================================================
create or replace function public.handle_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Apply to all tables (dropped and recreated so this script is safe to re-run)
drop trigger if exists set_updated_at_profiles on public.profiles;
create trigger set_updated_at_profiles
  before update on public.profiles
  for each row execute function public.handle_updated_at();

drop trigger if exists set_updated_at_companies on public.companies;
create trigger set_updated_at_companies
  before update on public.companies
  for each row execute function public.handle_updated_at();

drop trigger if exists set_updated_at_tasks on public.tasks;
create trigger set_updated_at_tasks
  before update on public.tasks
  for each row execute function public.handle_updated_at();


-- ============================================================
-- TRIGGER: handle_new_user
-- When a user signs up, automatically create their profile row.
-- ============================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name)
  values (
    new.id,
    new.raw_user_meta_data ->> 'full_name'
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();


-- ============================================================
-- STORAGE: company-logos bucket for uploaded company logos.
-- Public read (so logo URLs work directly in <img>), writes
-- restricted to the uploading user's own folder (<user_id>/...).
-- ============================================================
insert into storage.buckets (id, name, public)
values ('company-logos', 'company-logos', true)
on conflict (id) do nothing;

drop policy if exists "company-logos: read" on storage.objects;
create policy "company-logos: read"
  on storage.objects for select
  using (bucket_id = 'company-logos');

drop policy if exists "company-logos: insert own" on storage.objects;
create policy "company-logos: insert own"
  on storage.objects for insert
  with check (bucket_id = 'company-logos' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "company-logos: update own" on storage.objects;
create policy "company-logos: update own"
  on storage.objects for update
  using (bucket_id = 'company-logos' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "company-logos: delete own" on storage.objects;
create policy "company-logos: delete own"
  on storage.objects for delete
  using (bucket_id = 'company-logos' and (storage.foldername(name))[1] = auth.uid()::text);


-- ============================================================
-- NOTIFICATIONS (Web Push)
-- Per-task reminder, per-device push subscriptions, per-user
-- notification settings, and a de-duplication log.
-- The scheduler itself (pg_cron -> Edge Function) is set up by
-- supabase-notifications-cron.sql.
-- ============================================================

-- Per-task reminder: how long before the due moment to notify.
-- Tasks with a date but no time are treated as due at 09:00 local time.
alter table public.tasks add column if not exists reminder text not null default 'none';
alter table public.tasks drop constraint if exists tasks_reminder_check;
alter table public.tasks add constraint tasks_reminder_check
  check (reminder in ('none', 'at_time', '15m', '30m', '1h', '1d'));

-- One row per browser/device that enabled push.
create table if not exists public.push_subscriptions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  endpoint     text not null unique,
  p256dh       text not null,
  auth         text not null,
  user_agent   text,
  created_at   timestamptz default now(),
  last_seen_at timestamptz default now()
);
create index if not exists push_subscriptions_user_id_idx on public.push_subscriptions (user_id);

-- One row per user. The app upserts `timezone` automatically.
create table if not exists public.notification_settings (
  user_id               uuid primary key references auth.users(id) on delete cascade,
  timezone              text not null default 'UTC',
  due_soon_enabled      boolean not null default true,   -- ~1 hour before due
  overdue_enabled       boolean not null default true,
  daily_summary_enabled boolean not null default false,
  daily_summary_time    time not null default '08:00',   -- in the user's timezone
  created_at            timestamptz default now(),
  updated_at            timestamptz default now()
);

-- Every notification that was sent. The unique key is what prevents
-- duplicates, even if the scheduler overlaps or retries.
create table if not exists public.notification_log (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  task_id    uuid references public.tasks(id) on delete cascade,
  kind       text not null check (kind in ('reminder', 'due_soon', 'overdue', 'daily_summary')),
  dedupe_key text not null,
  sent_at    timestamptz default now(),
  unique (user_id, kind, dedupe_key)
);
create index if not exists notification_log_sent_at_idx on public.notification_log (sent_at);

-- Server-side secrets (e.g. the shared secret the scheduler uses to call the Edge Function).
-- RLS enabled with NO policies: only the service role / postgres can read it.
create table if not exists public.app_private (
  key   text primary key,
  value text not null
);
alter table public.app_private enable row level security;
revoke all on public.app_private from anon, authenticated;
insert into public.app_private (key, value)
values ('cron_secret', replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''))
on conflict (key) do nothing;

alter table public.push_subscriptions    enable row level security;
alter table public.notification_settings enable row level security;
alter table public.notification_log      enable row level security;  -- no policies: service role only

drop policy if exists "push_subscriptions: select own" on public.push_subscriptions;
create policy "push_subscriptions: select own"
  on public.push_subscriptions for select using (auth.uid() = user_id);

drop policy if exists "push_subscriptions: delete own" on public.push_subscriptions;
create policy "push_subscriptions: delete own"
  on public.push_subscriptions for delete using (auth.uid() = user_id);

drop policy if exists "notification_settings: select own" on public.notification_settings;
create policy "notification_settings: select own"
  on public.notification_settings for select using (auth.uid() = user_id);

drop policy if exists "notification_settings: insert own" on public.notification_settings;
create policy "notification_settings: insert own"
  on public.notification_settings for insert with check (auth.uid() = user_id);

drop policy if exists "notification_settings: update own" on public.notification_settings;
create policy "notification_settings: update own"
  on public.notification_settings for update using (auth.uid() = user_id);

drop trigger if exists set_updated_at_notification_settings on public.notification_settings;
create trigger set_updated_at_notification_settings
  before update on public.notification_settings
  for each row execute function public.handle_updated_at();

-- Registers (or re-assigns) this device's push subscription for the caller.
-- A function is used instead of a plain insert so that a device that was
-- previously used by a different account is safely handed over.
create or replace function public.register_push_subscription(
  p_endpoint text, p_p256dh text, p_auth text, p_user_agent text default null
)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
  values (auth.uid(), p_endpoint, p_p256dh, p_auth, p_user_agent)
  on conflict (endpoint) do update
    set user_id = auth.uid(), p256dh = excluded.p256dh, auth = excluded.auth,
        user_agent = excluded.user_agent, last_seen_at = now();
end;
$$;
revoke all on function public.register_push_subscription(text, text, text, text) from public, anon;
grant execute on function public.register_push_subscription(text, text, text, text) to authenticated;


-- ============================================================
-- Done! Your Jadwali database now matches the current app:
-- profiles (name only) + companies (name, logo, position, notes,
-- accent color) + tasks (optionally linked to a company).
-- Exams/Interviews removed. Company logos upload to Storage.
-- Notifications: tasks.reminder, push_subscriptions,
-- notification_settings, notification_log.
-- ============================================================
