-- =============================================================================
-- Employee Task Tracker — Supabase schema
-- =============================================================================
-- Paste this entire file into the Supabase SQL Editor (Project > SQL Editor >
-- New query) and run it once on a fresh project. It is safe to re-run because
-- most statements use IF NOT EXISTS / OR REPLACE, but it is written to be run
-- top-to-bottom on an empty database.
--
-- What this file creates:
--   1. Enums for role / urgency / status / event type
--   2. profiles table (linked 1:1 to auth.users)
--   3. tasks table
--   4. task_events table (append-only audit log)
--   5. Helper function is_admin()
--   6. Trigger that auto-creates a profile row when a new auth user is created
--   7. updated_at maintenance trigger
--   8. Trigger that stops core fields being edited directly (id/created_by/created_at)
--   9. Row Level Security policies for all three tables
--  10. A trigger that writes task_events rows automatically for admin edits
--  11. Secure RPC functions: mark_task_viewed, complete_task, reopen_task
--  12. Grants
--  13. Realtime publication for tasks + task_events
--  14. task_templates table (admin's reusable task presets) + RLS
--  15. urgency_settings table (customizable urgency colors) + RLS + seed data
--  16. calendar_events table (employee-added appointments/deliveries) + RLS
--  17. task_recurrences table (repeating tasks) + generation/stop RPCs + RLS
--  18. task_comments table (two-way notes on a task) + RLS
--  19. task_photos table + Storage bucket/policies (photo attachments) + RLS
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 0. Extensions
-- -----------------------------------------------------------------------------
create extension if not exists pgcrypto;


-- -----------------------------------------------------------------------------
-- 1. Enums
-- -----------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'user_role') then
    create type public.user_role as enum ('admin', 'employee');
  end if;

  if not exists (select 1 from pg_type where typname = 'task_urgency') then
    create type public.task_urgency as enum ('low', 'normal', 'high', 'urgent');
  end if;

  if not exists (select 1 from pg_type where typname = 'task_status') then
    create type public.task_status as enum ('open', 'completed');
  end if;

  if not exists (select 1 from pg_type where typname = 'task_event_type') then
    create type public.task_event_type as enum (
      'created',
      'viewed',
      'completed',
      'reopened',
      'edited',
      'due_date_changed',
      'urgency_changed',
      'deleted'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'calendar_event_type') then
    create type public.calendar_event_type as enum ('appointment', 'delivery');
  end if;
end
$$;


-- -----------------------------------------------------------------------------
-- 2. profiles — one row per auth.users row
-- -----------------------------------------------------------------------------
create table if not exists public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  full_name  text not null default '',
  email      text,
  role       public.user_role not null default 'employee',
  created_at timestamptz not null default now()
);

comment on table public.profiles is 'One row per application user, linked to auth.users. Role drives all access control.';


-- -----------------------------------------------------------------------------
-- 3. tasks
-- -----------------------------------------------------------------------------
create table if not exists public.tasks (
  id               uuid primary key default gen_random_uuid(),
  title            text not null check (char_length(btrim(title)) > 0),
  description      text not null default '',
  assigned_to      uuid not null references public.profiles (id) on delete restrict,
  created_by       uuid not null references public.profiles (id) on delete restrict,
  due_date         date not null,
  due_time         time,
  urgency          public.task_urgency not null default 'normal',
  status           public.task_status not null default 'open',
  first_viewed_at  timestamptz,
  last_viewed_at   timestamptz,
  completed_at     timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

comment on table public.tasks is 'Tasks assigned by an admin to an employee. Viewed/completed timestamps are server-set only, via RPC functions.';

create index if not exists tasks_assigned_to_idx on public.tasks (assigned_to);
create index if not exists tasks_created_by_idx on public.tasks (created_by);
create index if not exists tasks_due_date_idx on public.tasks (due_date);
create index if not exists tasks_status_idx on public.tasks (status);
create index if not exists tasks_urgency_idx on public.tasks (urgency);


-- -----------------------------------------------------------------------------
-- 4. task_events — append-only audit trail
-- -----------------------------------------------------------------------------
create table if not exists public.task_events (
  id         uuid primary key default gen_random_uuid(),
  task_id    uuid not null references public.tasks (id) on delete cascade,
  user_id    uuid references public.profiles (id) on delete set null,
  event_type public.task_event_type not null,
  metadata   jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

comment on table public.task_events is 'Append-only activity log. Rows are only ever written by triggers or SECURITY DEFINER RPC functions — never inserted directly by clients.';

create index if not exists task_events_task_id_idx on public.task_events (task_id);
create index if not exists task_events_created_at_idx on public.task_events (created_at);


-- -----------------------------------------------------------------------------
-- 5. is_admin() — SECURITY DEFINER helper used throughout RLS policies
-- -----------------------------------------------------------------------------
-- This function is owned by the table owner (postgres), which has BYPASSRLS,
-- so calling it from inside a policy on `profiles` does not recurse infinitely.
create or replace function public.is_admin(uid uuid default auth.uid())
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p where p.id = uid and p.role = 'admin'
  );
$$;

revoke all on function public.is_admin(uuid) from public;
grant execute on function public.is_admin(uuid) to authenticated;


-- -----------------------------------------------------------------------------
-- 6. Auto-create a profile row whenever a new auth user is created
-- -----------------------------------------------------------------------------
-- When you create a user in Supabase Authentication > Users > Add user, you
-- can supply "User Metadata" (raw_user_meta_data) as JSON, e.g.
--   { "full_name": "Jane Doe", "role": "admin" }
-- This trigger reads that metadata to pre-fill the profile. If role is
-- omitted it defaults to 'employee'. You can always change it later with a
-- simple UPDATE statement (see README).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''), split_part(new.email, '@', 1)),
    case
      when (new.raw_user_meta_data ->> 'role') = 'admin' then 'admin'::public.user_role
      else 'employee'::public.user_role
    end
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();


-- -----------------------------------------------------------------------------
-- 7. updated_at maintenance
-- -----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists tasks_set_updated_at on public.tasks;
create trigger tasks_set_updated_at
  before update on public.tasks
  for each row execute function public.set_updated_at();


-- -----------------------------------------------------------------------------
-- 8. Lock immutable fields on tasks (id, created_by, created_at)
-- -----------------------------------------------------------------------------
-- Belt-and-braces: even the admin's broad UPDATE policy should not be able to
-- rewrite history. This trigger silently forces these three columns back to
-- their original values on every UPDATE, no matter what the client sent.
create or replace function public.protect_task_immutable_fields()
returns trigger
language plpgsql
as $$
begin
  new.id := old.id;
  new.created_by := old.created_by;
  new.created_at := old.created_at;
  return new;
end;
$$;

drop trigger if exists tasks_protect_immutable on public.tasks;
create trigger tasks_protect_immutable
  before update on public.tasks
  for each row execute function public.protect_task_immutable_fields();


-- -----------------------------------------------------------------------------
-- 9. Automatic task_events logging for creation + admin edits
-- -----------------------------------------------------------------------------
-- Handles: created, edited, due_date_changed, urgency_changed.
-- viewed / completed / reopened are logged explicitly inside the RPC
-- functions in section 11, not here, so each event is only ever logged once.
create or replace function public.log_task_changes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.task_events (task_id, user_id, event_type, metadata)
    values (new.id, new.created_by, 'created', jsonb_build_object(
      'assigned_to', new.assigned_to,
      'due_date', new.due_date,
      'urgency', new.urgency
    ));
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if new.due_date is distinct from old.due_date then
      insert into public.task_events (task_id, user_id, event_type, metadata)
      values (new.id, auth.uid(), 'due_date_changed', jsonb_build_object(
        'old_due_date', old.due_date, 'new_due_date', new.due_date
      ));
    end if;

    if new.urgency is distinct from old.urgency then
      insert into public.task_events (task_id, user_id, event_type, metadata)
      values (new.id, auth.uid(), 'urgency_changed', jsonb_build_object(
        'old_urgency', old.urgency, 'new_urgency', new.urgency
      ));
    end if;

    if new.title is distinct from old.title
       or new.description is distinct from old.description
       or new.assigned_to is distinct from old.assigned_to
       or new.due_time is distinct from old.due_time then
      insert into public.task_events (task_id, user_id, event_type, metadata)
      values (new.id, auth.uid(), 'edited', '{}'::jsonb);
    end if;

    return new;
  end if;

  return new;
end;
$$;

drop trigger if exists tasks_log_changes on public.tasks;
create trigger tasks_log_changes
  after insert or update on public.tasks
  for each row execute function public.log_task_changes();


-- -----------------------------------------------------------------------------
-- 10. Row Level Security
-- -----------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.tasks enable row level security;
alter table public.task_events enable row level security;

-- ---- profiles -----------------------------------------------------------
-- Everyone can read their own profile; admins can read every profile
-- (needed to populate the "assign to" dropdown and show employee names).
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select
  to authenticated
  using (id = auth.uid() or public.is_admin());

-- Only admins may update profiles (e.g. renaming an employee, promoting to
-- admin). Regular users cannot self-edit their role.
drop policy if exists profiles_update_admin on public.profiles;
create policy profiles_update_admin on public.profiles
  for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Profile rows are normally created by the handle_new_user trigger. Also
-- allow an admin to insert one directly (edge case: profile row missing).
drop policy if exists profiles_insert_admin on public.profiles;
create policy profiles_insert_admin on public.profiles
  for insert
  to authenticated
  with check (public.is_admin());

-- Only admins may delete profiles.
drop policy if exists profiles_delete_admin on public.profiles;
create policy profiles_delete_admin on public.profiles
  for delete
  to authenticated
  using (public.is_admin());


-- ---- tasks ----------------------------------------------------------------
-- Admins see every task. Employees see only tasks assigned to them.
drop policy if exists tasks_select on public.tasks;
create policy tasks_select on public.tasks
  for select
  to authenticated
  using (public.is_admin() or assigned_to = auth.uid());

-- Only admins may create tasks assigned to someone else, and only as
-- themselves (created_by must be their own id — enforced by WITH CHECK).
drop policy if exists tasks_insert_admin on public.tasks;
create policy tasks_insert_admin on public.tasks
  for insert
  to authenticated
  with check (public.is_admin() and created_by = auth.uid());

-- An employee (or admin) may also create a *personal* task for themselves —
-- a self-added to-do that only they (and admins) can see. This is the one
-- exception to "only admins manage tasks": it's allowed only when the task
-- is both created by AND assigned to the caller, which is how the rest of
-- the app (RPCs, other policies, the UI) recognizes a "self-created" task —
-- no separate schema column needed.
drop policy if exists tasks_insert_self on public.tasks;
create policy tasks_insert_self on public.tasks
  for insert
  to authenticated
  with check (created_by = auth.uid() and assigned_to = auth.uid());

-- Only admins may run a direct UPDATE on tasks assigned to someone else
-- (used by the task edit form / drag-and-drop). Employees have no UPDATE
-- policy on tasks assigned to them by an admin — they cannot change
-- urgency, assignment, dates, or timestamps by any direct API/SQL call.
-- Their only way to change an admin-assigned task's state is through the
-- mark_task_viewed / complete_task / reopen_task RPC functions below,
-- which run as SECURITY DEFINER with their own explicit authorization
-- checks and only ever touch the specific viewing/completion columns.
drop policy if exists tasks_update_admin on public.tasks;
create policy tasks_update_admin on public.tasks
  for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- An employee may directly edit (or delete, below) their own self-created
-- task the same way an admin edits any task — since it's their own personal
-- to-do, not something an admin assigned them. WITH CHECK still requires
-- the task to stay self-assigned after the update, so it can't be used to
-- reassign a task to someone else or "adopt" someone else's task.
drop policy if exists tasks_update_self on public.tasks;
create policy tasks_update_self on public.tasks
  for update
  to authenticated
  using (created_by = auth.uid() and assigned_to = auth.uid())
  with check (created_by = auth.uid() and assigned_to = auth.uid());

-- Only admins may delete tasks assigned to someone else.
drop policy if exists tasks_delete_admin on public.tasks;
create policy tasks_delete_admin on public.tasks
  for delete
  to authenticated
  using (public.is_admin());

-- An employee may delete their own self-created task.
drop policy if exists tasks_delete_self on public.tasks;
create policy tasks_delete_self on public.tasks
  for delete
  to authenticated
  using (created_by = auth.uid() and assigned_to = auth.uid());


-- ---- task_events ------------------------------------------------------------
-- Admins can see every event. Employees can see events for tasks assigned to
-- them (useful context, e.g. "Task assigned" / "You viewed this"). No one
-- gets an INSERT policy — rows are only ever written by the SECURITY DEFINER
-- trigger/functions above, which run as the table owner and bypass RLS.
drop policy if exists task_events_select on public.task_events;
create policy task_events_select on public.task_events
  for select
  to authenticated
  using (
    public.is_admin()
    or exists (
      select 1 from public.tasks t
      where t.id = task_events.task_id and t.assigned_to = auth.uid()
    )
  );


-- -----------------------------------------------------------------------------
-- 11. Secure RPC functions for view / complete / reopen
-- -----------------------------------------------------------------------------
-- All three: SECURITY DEFINER so they can update tasks/task_events regardless
-- of the caller's RLS grants, but each one starts by independently verifying
-- auth.uid() and the row's assigned_to before touching anything. Timestamps
-- always come from now() (database/server clock) — never from a client
-- argument.

-- mark_task_viewed: called when the employee opens a task's details.
-- Sets first_viewed_at only the first time; always refreshes last_viewed_at.
create or replace function public.mark_task_viewed(p_task_id uuid)
returns public.tasks
language plpgsql
security definer
set search_path = public
as $$
declare
  v_task public.tasks;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select * into v_task from public.tasks where id = p_task_id for update;

  if not found then
    raise exception 'Task not found';
  end if;

  -- Deliberately NOT bypassed for admins: viewing is only meaningful when
  -- the assigned employee opens their own task. If the admin opens the same
  -- task details screen in their UI, the frontend simply does not call this
  -- function, so admin previews never pollute first_viewed_at/last_viewed_at.
  if v_task.assigned_to <> auth.uid() then
    raise exception 'Not authorized to view this task';
  end if;

  update public.tasks
     set first_viewed_at = coalesce(first_viewed_at, now()),
         last_viewed_at = now()
   where id = p_task_id
   returning * into v_task;

  insert into public.task_events (task_id, user_id, event_type)
  values (p_task_id, auth.uid(), 'viewed');

  return v_task;
end;
$$;

revoke all on function public.mark_task_viewed(uuid) from public;
grant execute on function public.mark_task_viewed(uuid) to authenticated;


-- complete_task: called when the employee (or admin) presses "Mark Complete".
create or replace function public.complete_task(p_task_id uuid)
returns public.tasks
language plpgsql
security definer
set search_path = public
as $$
declare
  v_task public.tasks;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select * into v_task from public.tasks where id = p_task_id for update;

  if not found then
    raise exception 'Task not found';
  end if;

  if v_task.assigned_to <> auth.uid() and not public.is_admin() then
    raise exception 'Not authorized to complete this task';
  end if;

  update public.tasks
     set status = 'completed',
         completed_at = now()
   where id = p_task_id
   returning * into v_task;

  insert into public.task_events (task_id, user_id, event_type)
  values (p_task_id, auth.uid(), 'completed');

  return v_task;
end;
$$;

revoke all on function public.complete_task(uuid) from public;
grant execute on function public.complete_task(uuid) to authenticated;


-- reopen_task: called by the admin (from the task details view) or the
-- employee ("mark incomplete again").
create or replace function public.reopen_task(p_task_id uuid)
returns public.tasks
language plpgsql
security definer
set search_path = public
as $$
declare
  v_task public.tasks;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select * into v_task from public.tasks where id = p_task_id for update;

  if not found then
    raise exception 'Task not found';
  end if;

  if v_task.assigned_to <> auth.uid() and not public.is_admin() then
    raise exception 'Not authorized to reopen this task';
  end if;

  update public.tasks
     set status = 'open',
         completed_at = null
   where id = p_task_id
   returning * into v_task;

  insert into public.task_events (task_id, user_id, event_type)
  values (p_task_id, auth.uid(), 'reopened');

  return v_task;
end;
$$;

revoke all on function public.reopen_task(uuid) from public;
grant execute on function public.reopen_task(uuid) to authenticated;


-- -----------------------------------------------------------------------------
-- 12. Table grants
-- -----------------------------------------------------------------------------
-- RLS policies still apply on top of these — grants just say "this role may
-- attempt this kind of statement at all"; policies decide which rows.
grant select, insert, update, delete on public.tasks to authenticated;
grant select, insert, update, delete on public.profiles to authenticated;
grant select on public.task_events to authenticated;
-- No insert/update/delete grant on task_events for authenticated users: all
-- writes happen inside SECURITY DEFINER functions owned by the table owner.


-- -----------------------------------------------------------------------------
-- 13. Realtime
-- -----------------------------------------------------------------------------
-- Lets the admin's calendar/list update live when the employee views or
-- completes a task, without a page refresh.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'tasks'
  ) then
    alter publication supabase_realtime add table public.tasks;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'task_events'
  ) then
    alter publication supabase_realtime add table public.task_events;
  end if;
end
$$;

-- -----------------------------------------------------------------------------
-- 14. task_templates — admin's reusable "preset" tasks
-- -----------------------------------------------------------------------------
-- Lets the admin save commonly-assigned tasks (title/description/default
-- urgency) and pick from them when creating a real task, instead of retyping
-- the same instructions every time. Purely an admin convenience — templates
-- are never assigned to anyone and never appear to employees.
create table if not exists public.task_templates (
  id          uuid primary key default gen_random_uuid(),
  title       text not null check (char_length(btrim(title)) > 0),
  description text not null default '',
  urgency     public.task_urgency not null default 'normal',
  created_by  uuid not null references public.profiles (id) on delete restrict,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.task_templates is 'Reusable preset tasks the admin can pick from when creating a real task. Admin-only.';

drop trigger if exists task_templates_set_updated_at on public.task_templates;
create trigger task_templates_set_updated_at
  before update on public.task_templates
  for each row execute function public.set_updated_at();

alter table public.task_templates enable row level security;

-- Only admins can see or manage templates — employees never create tasks,
-- so templates are irrelevant (and invisible) to them.
drop policy if exists task_templates_all_admin on public.task_templates;
create policy task_templates_all_admin on public.task_templates
  for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin() and created_by = auth.uid());

grant select, insert, update, delete on public.task_templates to authenticated;


-- -----------------------------------------------------------------------------
-- 15. urgency_settings — customizable urgency colors
-- -----------------------------------------------------------------------------
-- One row per urgency level, storing the accent color used throughout the
-- UI. Seeded with the app's defaults below. Everyone (admin + employee)
-- needs to READ this so badges render correctly; only the admin may change
-- it. There are always exactly 4 rows (one per urgency enum value) — the
-- app never inserts or deletes rows here, only updates the color column.
create table if not exists public.urgency_settings (
  urgency    public.task_urgency primary key,
  color      text not null,
  updated_at timestamptz not null default now()
);

comment on table public.urgency_settings is 'Admin-customizable accent color per urgency level. Always exactly 4 rows (low/normal/high/urgent).';

insert into public.urgency_settings (urgency, color) values
  ('low', '#1a7f37'),
  ('normal', '#1f6feb'),
  ('high', '#b35900'),
  ('urgent', '#c0192b')
on conflict (urgency) do nothing;

drop trigger if exists urgency_settings_set_updated_at on public.urgency_settings;
create trigger urgency_settings_set_updated_at
  before update on public.urgency_settings
  for each row execute function public.set_updated_at();

alter table public.urgency_settings enable row level security;

drop policy if exists urgency_settings_select on public.urgency_settings;
create policy urgency_settings_select on public.urgency_settings
  for select
  to authenticated
  using (true);

drop policy if exists urgency_settings_update_admin on public.urgency_settings;
create policy urgency_settings_update_admin on public.urgency_settings
  for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

grant select on public.urgency_settings to authenticated;
grant update (color) on public.urgency_settings to authenticated;

-- Live color changes show up for both users without a refresh.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'urgency_settings'
  ) then
    alter publication supabase_realtime add table public.urgency_settings;
  end if;
end
$$;

-- -----------------------------------------------------------------------------
-- 16. calendar_events — employee-added appointments/deliveries
-- -----------------------------------------------------------------------------
-- Unlike tasks (admin assigns, employee completes), calendar_events are a
-- shared logistics calendar: any signed-in user (admin or employee) can add
-- an appointment or delivery, everyone can see everyone else's (so people
-- don't double-book a delivery slot), and only the creator or an admin can
-- edit/delete a given entry. created_by is always shown in the UI so it's
-- obvious who added it.
create table if not exists public.calendar_events (
  id          uuid primary key default gen_random_uuid(),
  title       text not null check (char_length(btrim(title)) > 0),
  description text not null default '',
  event_type  public.calendar_event_type not null default 'appointment',
  event_date  date not null,
  event_time  time,
  created_by  uuid not null references public.profiles (id) on delete restrict,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.calendar_events is 'Shared calendar entries (appointments/deliveries) that any employee or admin can add. Visible to everyone; editable only by the creator or an admin.';

create index if not exists calendar_events_event_date_idx on public.calendar_events (event_date);
create index if not exists calendar_events_created_by_idx on public.calendar_events (created_by);

drop trigger if exists calendar_events_set_updated_at on public.calendar_events;
create trigger calendar_events_set_updated_at
  before update on public.calendar_events
  for each row execute function public.set_updated_at();

-- Belt-and-braces, same pattern as tasks: even the creator/admin's UPDATE
-- policy below should never be able to rewrite who created an entry or when.
create or replace function public.protect_calendar_event_immutable_fields()
returns trigger
language plpgsql
as $$
begin
  new.id := old.id;
  new.created_by := old.created_by;
  new.created_at := old.created_at;
  return new;
end;
$$;

drop trigger if exists calendar_events_protect_immutable on public.calendar_events;
create trigger calendar_events_protect_immutable
  before update on public.calendar_events
  for each row execute function public.protect_calendar_event_immutable_fields();

alter table public.calendar_events enable row level security;

-- Everyone signed in can see every calendar event — it's a shared team
-- calendar, not per-employee like tasks.
drop policy if exists calendar_events_select on public.calendar_events;
create policy calendar_events_select on public.calendar_events
  for select
  to authenticated
  using (true);

-- Any signed-in user can add an entry, but only attributed to themselves —
-- created_by must match auth.uid(), so no one can post as someone else.
drop policy if exists calendar_events_insert on public.calendar_events;
create policy calendar_events_insert on public.calendar_events
  for insert
  to authenticated
  with check (created_by = auth.uid());

-- Only the creator or an admin may edit an entry.
drop policy if exists calendar_events_update on public.calendar_events;
create policy calendar_events_update on public.calendar_events
  for update
  to authenticated
  using (created_by = auth.uid() or public.is_admin())
  with check (created_by = auth.uid() or public.is_admin());

-- Only the creator or an admin may delete an entry.
drop policy if exists calendar_events_delete on public.calendar_events;
create policy calendar_events_delete on public.calendar_events
  for delete
  to authenticated
  using (created_by = auth.uid() or public.is_admin());

grant select, insert, update, delete on public.calendar_events to authenticated;

-- Live updates: when one employee adds an appointment/delivery, everyone
-- else's calendar updates without a refresh.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'calendar_events'
  ) then
    alter publication supabase_realtime add table public.calendar_events;
  end if;
end
$$;

-- -----------------------------------------------------------------------------
-- 17. task_recurrences — repeating tasks
-- -----------------------------------------------------------------------------
-- A recurrence is a lightweight template ("Water the plants", every day)
-- that gets expanded into ordinary rows in public.tasks — one per
-- occurrence — by ensure_recurring_task_instances() below. Each generated
-- occurrence is a completely normal task afterwards: it can be viewed,
-- completed, reopened, edited, or deleted independently, through the exact
-- same policies/RPCs already defined above. Editing or completing one
-- occurrence never touches any other occurrence or the recurrence itself.
-- Follows the same admin-assigns-or-employee-creates-for-themselves rule as
-- tasks: created_by = assigned_to = auth.uid() is how a self-made recurrence
-- is recognized, exactly like tasks_insert_self.
do $$
begin
  if not exists (select 1 from pg_type where typname = 'task_recurrence_frequency') then
    create type public.task_recurrence_frequency as enum ('daily', 'weekly', 'monthly', 'weekdays');
  end if;
end
$$;

create table if not exists public.task_recurrences (
  id          uuid primary key default gen_random_uuid(),
  title       text not null check (char_length(btrim(title)) > 0),
  description text not null default '',
  urgency     public.task_urgency not null default 'normal',
  assigned_to uuid not null references public.profiles (id) on delete restrict,
  created_by  uuid not null references public.profiles (id) on delete restrict,
  frequency   public.task_recurrence_frequency not null,
  due_time    time,
  start_date  date not null,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.task_recurrences is 'Repeating-task definitions. Each active row is expanded into individual public.tasks rows by ensure_recurring_task_instances().';

create index if not exists task_recurrences_assigned_to_idx on public.task_recurrences (assigned_to);

-- One new column on the existing tasks table, linking a generated occurrence
-- back to the recurrence that created it. Nullable — ordinary (non-repeating)
-- tasks never set it. If the recurrence row is ever deleted directly, this
-- just goes null on any tasks that referenced it rather than deleting them.
alter table public.tasks add column if not exists recurrence_id uuid references public.task_recurrences (id) on delete set null;
create index if not exists tasks_recurrence_id_idx on public.tasks (recurrence_id);

drop trigger if exists task_recurrences_set_updated_at on public.task_recurrences;
create trigger task_recurrences_set_updated_at
  before update on public.task_recurrences
  for each row execute function public.set_updated_at();

alter table public.task_recurrences enable row level security;

-- Same visibility rule as tasks: admins see every recurrence, employees see
-- only their own (the ones assigned to them).
drop policy if exists task_recurrences_select on public.task_recurrences;
create policy task_recurrences_select on public.task_recurrences
  for select
  to authenticated
  using (public.is_admin() or assigned_to = auth.uid());

-- Admins can start a recurrence assigned to anyone, as themselves.
drop policy if exists task_recurrences_insert_admin on public.task_recurrences;
create policy task_recurrences_insert_admin on public.task_recurrences
  for insert
  to authenticated
  with check (public.is_admin() and created_by = auth.uid());

-- An employee can start a recurrence for themselves only — same
-- created_by = assigned_to = auth.uid() rule as tasks_insert_self.
drop policy if exists task_recurrences_insert_self on public.task_recurrences;
create policy task_recurrences_insert_self on public.task_recurrences
  for insert
  to authenticated
  with check (created_by = auth.uid() and assigned_to = auth.uid());

-- Admins can update any recurrence (used to stop a series they started).
drop policy if exists task_recurrences_update_admin on public.task_recurrences;
create policy task_recurrences_update_admin on public.task_recurrences
  for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- An employee can update (stop) their own self-created recurrence.
drop policy if exists task_recurrences_update_self on public.task_recurrences;
create policy task_recurrences_update_self on public.task_recurrences
  for update
  to authenticated
  using (created_by = auth.uid() and assigned_to = auth.uid())
  with check (created_by = auth.uid() and assigned_to = auth.uid());

-- Admins can delete any recurrence; an employee can delete their own.
drop policy if exists task_recurrences_delete_admin on public.task_recurrences;
create policy task_recurrences_delete_admin on public.task_recurrences
  for delete
  to authenticated
  using (public.is_admin());

drop policy if exists task_recurrences_delete_self on public.task_recurrences;
create policy task_recurrences_delete_self on public.task_recurrences
  for delete
  to authenticated
  using (created_by = auth.uid() and assigned_to = auth.uid());

grant select, insert, update, delete on public.task_recurrences to authenticated;

-- ensure_recurring_task_instances(): tops up every active recurrence with
-- any occurrences due between "the last one already generated" and 60 days
-- from today, capped at a generous number of inserts per call so a bad
-- recurrence can never runaway-generate. Safe to call from any signed-in
-- user's session — it never lets the caller supply any data, it only
-- materializes occurrences from recurrence rows that were already created
-- through the authorized INSERT policies above — and cheap to call
-- frequently, since it's a no-op once a recurrence's instances are already
-- topped up. The frontend calls this once per session on login, and the
-- generated tasks show up for everyone live via the existing Realtime
-- publication on public.tasks (no separate publication needed here).
create or replace function public.ensure_recurring_task_instances()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  rec record;
  last_date date;
  next_date date;
  horizon date := current_date + 60;
  day_of_month int;
  target_month date;
  last_day_of_month date;
  total_inserted int := 0;
  max_inserts constant int := 300;
begin
  for rec in select * from public.task_recurrences where active loop
    select max(due_date) into last_date
      from public.tasks
     where recurrence_id = rec.id;

    if last_date is null then
      next_date := rec.start_date;
      if rec.frequency = 'weekdays' then
        while extract(isodow from next_date) in (6, 7) loop
          next_date := next_date + 1;
        end loop;
      end if;
    else
      case rec.frequency
        when 'daily' then
          next_date := last_date + 1;
        when 'weekly' then
          next_date := last_date + 7;
        when 'weekdays' then
          next_date := last_date + 1;
          while extract(isodow from next_date) in (6, 7) loop
            next_date := next_date + 1;
          end loop;
        when 'monthly' then
          day_of_month := extract(day from rec.start_date)::int;
          target_month := (date_trunc('month', last_date) + interval '1 month')::date;
          last_day_of_month := ((target_month + interval '1 month')::date - 1);
          next_date := least(target_month + (day_of_month - 1), last_day_of_month);
      end case;
    end if;

    while next_date <= horizon and total_inserted < max_inserts loop
      insert into public.tasks
        (title, description, urgency, assigned_to, created_by, due_date, due_time, recurrence_id)
      values
        (rec.title, rec.description, rec.urgency, rec.assigned_to, rec.created_by, next_date, rec.due_time, rec.id);
      total_inserted := total_inserted + 1;

      case rec.frequency
        when 'daily' then
          next_date := next_date + 1;
        when 'weekly' then
          next_date := next_date + 7;
        when 'weekdays' then
          next_date := next_date + 1;
          while extract(isodow from next_date) in (6, 7) loop
            next_date := next_date + 1;
          end loop;
        when 'monthly' then
          day_of_month := extract(day from rec.start_date)::int;
          target_month := (date_trunc('month', next_date) + interval '1 month')::date;
          last_day_of_month := ((target_month + interval '1 month')::date - 1);
          next_date := least(target_month + (day_of_month - 1), last_day_of_month);
      end case;
    end loop;

    exit when total_inserted >= max_inserts;
  end loop;
end;
$$;

revoke all on function public.ensure_recurring_task_instances() from public;
grant execute on function public.ensure_recurring_task_instances() to authenticated;

-- stop_task_recurrence(): ends a repeating series. Deactivates the
-- recurrence (so no further occurrences are ever generated) and removes any
-- already-generated occurrences that are still open and due today or
-- later — completed and past occurrences are left alone as history. Only
-- the recurrence's own creator or an admin may call this.
create or replace function public.stop_task_recurrence(p_recurrence_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rec public.task_recurrences;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select * into v_rec from public.task_recurrences where id = p_recurrence_id for update;

  if not found then
    raise exception 'Recurrence not found';
  end if;

  if not public.is_admin() and v_rec.created_by <> auth.uid() then
    raise exception 'Not authorized to stop this recurrence';
  end if;

  update public.task_recurrences set active = false where id = p_recurrence_id;

  delete from public.tasks
   where recurrence_id = p_recurrence_id
     and status = 'open'
     and due_date >= current_date;
end;
$$;

revoke all on function public.stop_task_recurrence(uuid) from public;
grant execute on function public.stop_task_recurrence(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- can_access_task() — shared visibility check for task_comments/task_photos
-- -----------------------------------------------------------------------------
-- Same rule as tasks_select above (admin, or the assigned employee), pulled
-- out into a helper since both task_comments and task_photos (table +
-- Storage policies) need the exact same check.
create or replace function public.can_access_task(p_task_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.tasks t
    where t.id = p_task_id
      and (t.assigned_to = auth.uid() or public.is_admin())
  );
$$;

revoke all on function public.can_access_task(uuid) from public;
grant execute on function public.can_access_task(uuid) to authenticated;


-- -----------------------------------------------------------------------------
-- 18. task_comments — two-way notes on a task
-- -----------------------------------------------------------------------------
-- Free-form notes either side can leave on a task (e.g. "waiting on stain to
-- dry, finishing tomorrow") — separate from task_events, which is a
-- system-generated audit trail the client never writes to directly. Simple
-- append/delete only: no editing a comment after posting.
create table if not exists public.task_comments (
  id         uuid primary key default gen_random_uuid(),
  task_id    uuid not null references public.tasks (id) on delete cascade,
  author_id  uuid not null references public.profiles (id) on delete cascade,
  body       text not null check (char_length(btrim(body)) > 0),
  created_at timestamptz not null default now()
);

comment on table public.task_comments is 'Free-form notes employees/admins leave on a task, visible to both sides. Append/delete only — no editing.';

create index if not exists task_comments_task_id_idx on public.task_comments (task_id);

alter table public.task_comments enable row level security;

-- Same visibility as the task itself: admin sees every comment; an employee
-- sees comments only on tasks assigned to them.
drop policy if exists task_comments_select on public.task_comments;
create policy task_comments_select on public.task_comments
  for select
  to authenticated
  using (public.can_access_task(task_id));

-- Posting a comment requires being able to see the task, and attributing it
-- to yourself (author_id must match auth.uid()).
drop policy if exists task_comments_insert on public.task_comments;
create policy task_comments_insert on public.task_comments
  for insert
  to authenticated
  with check (author_id = auth.uid() and public.can_access_task(task_id));

-- Either the comment's own author or an admin may delete it (light-touch
-- moderation, e.g. a note posted to the wrong task).
drop policy if exists task_comments_delete on public.task_comments;
create policy task_comments_delete on public.task_comments
  for delete
  to authenticated
  using (author_id = auth.uid() or public.is_admin());

grant select, insert, delete on public.task_comments to authenticated;

-- Live updates: a note posted by one party shows up for the other without a
-- refresh, while they both have the same task's details open.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'task_comments'
  ) then
    alter publication supabase_realtime add table public.task_comments;
  end if;
end
$$;


-- -----------------------------------------------------------------------------
-- 19. task_photos — photo attachments (Storage bucket + policies)
-- -----------------------------------------------------------------------------
-- Image bytes live in a Storage bucket ("task-photos"); this table just
-- tracks which task each uploaded photo belongs to and who uploaded it, so
-- the UI can list/attribute/delete them the same way it does everything
-- else. The bucket is public (readable by anyone with the exact, effectively
-- unguessable URL — a random UUID path — the same trust model as a shared
-- Google Drive link), which keeps viewing a photo a plain <img src> with no
-- token/signed-URL management; uploading and deleting are still gated by the
-- policies below so only someone who can see the task can attach to it.
create table if not exists public.task_photos (
  id           uuid primary key default gen_random_uuid(),
  task_id      uuid not null references public.tasks (id) on delete cascade,
  uploaded_by  uuid not null references public.profiles (id) on delete cascade,
  storage_path text not null,
  created_at   timestamptz not null default now()
);

comment on table public.task_photos is 'Metadata for photos attached to a task. Actual image bytes live in the task-photos Storage bucket at storage_path.';

create index if not exists task_photos_task_id_idx on public.task_photos (task_id);

alter table public.task_photos enable row level security;

drop policy if exists task_photos_select on public.task_photos;
create policy task_photos_select on public.task_photos
  for select
  to authenticated
  using (public.can_access_task(task_id));

drop policy if exists task_photos_insert on public.task_photos;
create policy task_photos_insert on public.task_photos
  for insert
  to authenticated
  with check (uploaded_by = auth.uid() and public.can_access_task(task_id));

-- Either the uploader or an admin may delete a photo.
drop policy if exists task_photos_delete on public.task_photos;
create policy task_photos_delete on public.task_photos
  for delete
  to authenticated
  using (uploaded_by = auth.uid() or public.is_admin());

grant select, insert, delete on public.task_photos to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'task_photos'
  ) then
    alter publication supabase_realtime add table public.task_photos;
  end if;
end
$$;

-- The bucket itself, created idempotently. Storage objects are uploaded with
-- a path of "<task_id>/<random-filename>" — the policies below parse the
-- task_id back out of that path (storage.foldername(name) splits it into
-- path segments) to apply the exact same can_access_task() check as the
-- task_photos table above.
insert into storage.buckets (id, name, public)
values ('task-photos', 'task-photos', true)
on conflict (id) do nothing;

drop policy if exists task_photos_storage_select on storage.objects;
create policy task_photos_storage_select on storage.objects
  for select
  to authenticated
  using (bucket_id = 'task-photos');

drop policy if exists task_photos_storage_insert on storage.objects;
create policy task_photos_storage_insert on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'task-photos'
    and public.can_access_task(((storage.foldername(name))[1])::uuid)
  );

-- The Storage API sets `owner` to the uploader's auth.uid() automatically —
-- not something the client can spoof by writing to the objects table
-- directly, since it never gets a general INSERT/UPDATE grant on it.
drop policy if exists task_photos_storage_delete on storage.objects;
create policy task_photos_storage_delete on storage.objects
  for delete
  to authenticated
  using (bucket_id = 'task-photos' and (owner = auth.uid() or public.is_admin()));

-- =============================================================================
-- Done. Next steps (see README.md):
--   1. Authentication > Providers: confirm Email is enabled, disable "Allow
--      new users to sign up" if you want signups fully closed at the auth
--      layer too.
--   2. Authentication > Users > Add user to create your admin and employee
--      accounts (use "User Metadata" to set full_name/role — see README).
--   3. Copy your Project URL and anon public key into .env / Netlify env vars.
-- =============================================================================
