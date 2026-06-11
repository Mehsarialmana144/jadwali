-- ============================================================
-- Jadwali — Academic Planner
-- Supabase SQL Schema
-- Paste this entire file into the Supabase SQL Editor and run once.
-- ============================================================

-- Enable pgcrypto for gen_random_uuid()
create extension if not exists "pgcrypto";


-- ============================================================
-- TABLE: profiles
-- Automatically created when a new user signs up (see trigger below).
-- ============================================================
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  full_name   text,
  university  text,
  major       text,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);


-- ============================================================
-- TABLE: exams
-- ============================================================
create table if not exists public.exams (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  course_name   text not null,
  course_code   text,
  exam_date     date not null,
  exam_time     time,
  location      text,
  difficulty    text check (difficulty in ('easy', 'medium', 'hard')),
  study_topics  text,
  notes         text,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);


-- ============================================================
-- TABLE: interviews
-- ============================================================
create table if not exists public.interviews (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users(id) on delete cascade,
  company_name       text not null,
  position_title     text,
  interview_date     date not null,
  interview_time     time,
  interview_type     text check (interview_type in ('onsite', 'online', 'phone')),
  location_or_link   text,
  preparation_notes  text,
  notes              text,
  review_rating      integer check (review_rating between 1 and 5),
  review_role_type   text check (review_role_type in ('internship', 'coop', 'full_time', 'part_time')),
  review_role_clarity text check (review_role_clarity in ('clear', 'somewhat_clear', 'not_clear')),
  review_work_mode   text check (review_work_mode in ('onsite', 'online', 'hybrid', 'not_mentioned')),
  review_reward      text check (review_reward in ('yes', 'no', 'not_mentioned')),
  review_company_fit text check (review_company_fit in ('good', 'maybe', 'not_good')),
  review_pros        text,
  review_cons        text,
  review_questions_asked text,
  review_decision    text check (review_decision in ('interested', 'waiting', 'not_interested', 'need_more_info')),
  review_follow_up_notes text,
  created_at         timestamptz default now(),
  updated_at         timestamptz default now()
);

-- Additive migration for existing Jadwali databases.
alter table public.interviews add column if not exists review_rating integer check (review_rating between 1 and 5);
alter table public.interviews add column if not exists review_role_type text check (review_role_type in ('internship', 'coop', 'full_time', 'part_time'));
alter table public.interviews add column if not exists review_role_clarity text check (review_role_clarity in ('clear', 'somewhat_clear', 'not_clear'));
alter table public.interviews add column if not exists review_work_mode text check (review_work_mode in ('onsite', 'online', 'hybrid', 'not_mentioned'));
alter table public.interviews add column if not exists review_reward text check (review_reward in ('yes', 'no', 'not_mentioned'));
alter table public.interviews add column if not exists review_company_fit text check (review_company_fit in ('good', 'maybe', 'not_good'));
alter table public.interviews add column if not exists review_pros text;
alter table public.interviews add column if not exists review_cons text;
alter table public.interviews add column if not exists review_questions_asked text;
alter table public.interviews add column if not exists review_decision text check (review_decision in ('interested', 'waiting', 'not_interested', 'need_more_info'));
alter table public.interviews add column if not exists review_follow_up_notes text;


-- ============================================================
-- TABLE: tasks
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
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);


-- ============================================================
-- INDEXES — for faster user-specific queries
-- ============================================================
create index if not exists exams_user_id_idx       on public.exams      (user_id);
create index if not exists exams_exam_date_idx     on public.exams      (exam_date);

create index if not exists interviews_user_id_idx  on public.interviews (user_id);
create index if not exists interviews_date_idx     on public.interviews (interview_date);

create index if not exists tasks_user_id_idx       on public.tasks      (user_id);
create index if not exists tasks_due_date_idx      on public.tasks      (due_date);


-- ============================================================
-- ROW LEVEL SECURITY — enable on all tables
-- ============================================================
alter table public.profiles   enable row level security;
alter table public.exams      enable row level security;
alter table public.interviews enable row level security;
alter table public.tasks      enable row level security;


-- ============================================================
-- RLS POLICIES — profiles
-- ============================================================
create policy "profiles: select own"
  on public.profiles for select
  using (auth.uid() = id);

create policy "profiles: insert own"
  on public.profiles for insert
  with check (auth.uid() = id);

create policy "profiles: update own"
  on public.profiles for update
  using (auth.uid() = id);

create policy "profiles: delete own"
  on public.profiles for delete
  using (auth.uid() = id);


-- ============================================================
-- RLS POLICIES — exams
-- ============================================================
create policy "exams: select own"
  on public.exams for select
  using (auth.uid() = user_id);

create policy "exams: insert own"
  on public.exams for insert
  with check (auth.uid() = user_id);

create policy "exams: update own"
  on public.exams for update
  using (auth.uid() = user_id);

create policy "exams: delete own"
  on public.exams for delete
  using (auth.uid() = user_id);


-- ============================================================
-- RLS POLICIES — interviews
-- ============================================================
create policy "interviews: select own"
  on public.interviews for select
  using (auth.uid() = user_id);

create policy "interviews: insert own"
  on public.interviews for insert
  with check (auth.uid() = user_id);

create policy "interviews: update own"
  on public.interviews for update
  using (auth.uid() = user_id);

create policy "interviews: delete own"
  on public.interviews for delete
  using (auth.uid() = user_id);


-- ============================================================
-- RLS POLICIES — tasks
-- ============================================================
create policy "tasks: select own"
  on public.tasks for select
  using (auth.uid() = user_id);

create policy "tasks: insert own"
  on public.tasks for insert
  with check (auth.uid() = user_id);

create policy "tasks: update own"
  on public.tasks for update
  using (auth.uid() = user_id);

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

-- Apply to all four tables
create trigger set_updated_at_profiles
  before update on public.profiles
  for each row execute function public.handle_updated_at();

create trigger set_updated_at_exams
  before update on public.exams
  for each row execute function public.handle_updated_at();

create trigger set_updated_at_interviews
  before update on public.interviews
  for each row execute function public.handle_updated_at();

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

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();


-- ============================================================
-- Done! Your Jadwali database is ready.
-- ============================================================
