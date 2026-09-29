-- ============================================================
-- Jadwali — Mock/QA test data
-- Run this AFTER supabase-schema.sql has been applied.
-- Inserts clearly-labeled "[MOCK]" companies and tasks for EVERY
-- account in this project (not just one), so it lands on whichever
-- account you're actually signed into — even if you created more
-- than one test account. Covers every status, priority, and
-- due-date bucket the app needs to display.
--
-- Safe to re-run: for each user it deletes any previous rows whose
-- name/title starts with "[MOCK]" before re-inserting, so running
-- it twice won't duplicate data.
-- ============================================================

do $$
declare
  v_user record;
  v_user_id uuid;
  v_google uuid;
  v_freelance uuid;
  v_acme uuid;
  v_nimbus uuid;
  v_user_count int := 0;
begin
  for v_user in select id from auth.users loop
    v_user_id := v_user.id;
    v_user_count := v_user_count + 1;

    -- Clean up any previous mock run for this user (idempotent re-seed).
    delete from public.tasks where user_id = v_user_id and title like '[MOCK]%';
    delete from public.companies where user_id = v_user_id and name like '[MOCK]%';

    -- ---------------- Companies ----------------
    insert into public.companies (id, user_id, name, logo_url, position_title, notes, accent_color)
    values (gen_random_uuid(), v_user_id, '[MOCK] Google', 'https://api.dicebear.com/7.x/initials/svg?seed=Google&backgroundColor=4f52eb', 'Software Engineer', 'Full-time role, remote-friendly team.', '#4f52eb')
    returning id into v_google;

    insert into public.companies (id, user_id, name, logo_url, position_title, notes, accent_color)
    values (gen_random_uuid(), v_user_id, '[MOCK] Freelance Design Co', null, 'UI/UX Consultant', 'Weekly design reviews on Tuesdays.', '#10b981')
    returning id into v_freelance;

    insert into public.companies (id, user_id, name, logo_url, position_title, notes, accent_color)
    values (gen_random_uuid(), v_user_id, '[MOCK] Acme Robotics', 'https://api.dicebear.com/7.x/initials/svg?seed=Acme&backgroundColor=f59e0b', 'Intern', 'Summer internship, ends in August.', '#f59e0b')
    returning id into v_acme;

    insert into public.companies (id, user_id, name, logo_url, position_title, notes, accent_color)
    values (gen_random_uuid(), v_user_id, '[MOCK] Nimbus Ventures', null, 'Advisor', 'Quarterly advisory calls.', '#ec4899')
    returning id into v_nimbus;

    -- ---------------- Tasks: Google ----------------
    insert into public.tasks (user_id, company_id, title, due_date, due_time, category, priority, status, notes) values
      (v_user_id, v_google, '[MOCK] Fix login bug', current_date - 3, null, 'project', 'high', 'todo', 'Overdue — blocks QA sign-off.'),
      (v_user_id, v_google, '[MOCK] Prepare sprint demo', current_date, '14:00', 'project', 'medium', 'in_progress', null),
      (v_user_id, v_google, '[MOCK] Code review for PR #482', current_date - 5, null, 'project', 'medium', 'done', null),
      (v_user_id, v_google, '[MOCK] Update onboarding docs', current_date + 4, null, 'project', 'low', 'todo', null),
      (v_user_id, v_google, '[MOCK] Quarterly performance review', current_date + 20, null, 'other', 'high', 'todo', null);

    -- ---------------- Tasks: Freelance Design Co ----------------
    insert into public.tasks (user_id, company_id, title, due_date, due_time, category, priority, status, notes) values
      (v_user_id, v_freelance, '[MOCK] Client logo revisions', current_date - 1, null, 'project', 'medium', 'todo', 'Overdue by one day.'),
      (v_user_id, v_freelance, '[MOCK] Send invoice for September', current_date, '09:00', 'other', 'high', 'todo', null),
      (v_user_id, v_freelance, '[MOCK] Portfolio site refresh', current_date + 10, null, 'project', 'low', 'in_progress', null),
      (v_user_id, v_freelance, '[MOCK] Design system audit', current_date - 8, null, 'project', 'medium', 'done', null);

    -- ---------------- Tasks: Acme Robotics ----------------
    insert into public.tasks (user_id, company_id, title, due_date, due_time, category, priority, status, notes) values
      (v_user_id, v_acme, '[MOCK] Calibrate robot arm sensors', current_date + 1, null, 'project', 'high', 'todo', null),
      (v_user_id, v_acme, '[MOCK] Weekly intern check-in', current_date + 2, '11:00', 'other', 'low', 'todo', null),
      (v_user_id, v_acme, '[MOCK] Submit internship report', current_date + 25, null, 'project', 'medium', 'todo', null),
      (v_user_id, v_acme, '[MOCK] Lab safety training', current_date - 10, null, 'other', 'low', 'done', null);

    -- ---------------- Tasks: Nimbus Ventures ----------------
    insert into public.tasks (user_id, company_id, title, due_date, due_time, category, priority, status, notes) values
      (v_user_id, v_nimbus, '[MOCK] Review Q3 investment memo', current_date - 2, null, 'other', 'high', 'todo', 'Overdue.'),
      (v_user_id, v_nimbus, '[MOCK] Advisory call prep', current_date + 6, null, 'other', 'medium', 'in_progress', null),
      (v_user_id, v_nimbus, '[MOCK] Sign updated advisory agreement', null, null, 'other', 'low', 'todo', 'No due date — waiting on legal.');

    -- ---------------- Tasks: Personal (no company) ----------------
    insert into public.tasks (user_id, company_id, title, due_date, due_time, category, priority, status, notes) values
      (v_user_id, null, '[MOCK] Renew gym membership', current_date + 3, null, 'personal', 'low', 'todo', null),
      (v_user_id, null, '[MOCK] Book dentist appointment', current_date, '10:30', 'personal', 'medium', 'todo', null),
      (v_user_id, null, '[MOCK] Plan weekend trip', null, null, 'personal', 'low', 'todo', null),
      (v_user_id, null, '[MOCK] Read "Deep Work" chapter 4', current_date - 15, null, 'personal', 'low', 'done', null),
      (v_user_id, null, '[MOCK] Organize home office', current_date + 45, null, 'personal', 'medium', 'todo', 'Different month — tests month navigation.');
  end loop;

  if v_user_count = 0 then
    raise exception 'No users found in auth.users — sign up in the app first, then re-run this script.';
  end if;

  raise notice 'Mock data seeded for % account(s).', v_user_count;
end $$;

-- ============================================================
-- Quick verification: run these separately to confirm.
-- select email, id from auth.users;  -- find which account you're signed in as
-- select status, count(*) from public.tasks where title like '[MOCK]%' group by status;
-- select count(*) from public.companies where name like '[MOCK]%';
-- ============================================================
