# Task Tracker

A simple, calendar-based task tracker for assigning work to an employee and
verifying it was actually seen and done. Built with React, TypeScript, Vite,
and Supabase (Postgres + Auth + Row Level Security + Realtime), deployed on
Netlify.

Core workflow: **Assign → View → Complete → Verify.**

Also included: reusable **task presets** (save a common task once, pick it
from a list instead of retyping it), admin-**customizable urgency colors**
(both under the admin's **Templates** and **Settings** nav items), and a
shared **appointments/deliveries calendar** any employee or admin can add
to directly.

---

## 1. Prerequisites

You'll need:

- **Node.js 18 or newer** and npm (check with `node -v`).
- A free **Supabase** account: https://supabase.com
- A free **Netlify** account: https://netlify.com
- A **GitHub** account (to connect Netlify to your code).
- Basic comfort with copy/pasting commands into a terminal and pasting SQL
  into a web page. You do not need to be a professional developer.

---

## 2. Create your Supabase project

1. Go to https://supabase.com/dashboard and click **New project**.
2. Choose an organization, give the project a name (e.g. "task-tracker"),
   set a database password (save it somewhere safe — you likely won't need
   it again, but keep it anyway), pick a region close to you, and click
   **Create new project**. Wait a minute or two for it to finish provisioning.

---

## 3. Run the database setup SQL

1. In your Supabase project, open the left sidebar and click **SQL Editor**.
2. Click **New query**.
3. Open the file `supabase/schema.sql` from this project, copy its entire
   contents, and paste it into the SQL editor.
4. Click **Run** (or press Cmd/Ctrl+Enter).
5. You should see a series of `CREATE TABLE` / `CREATE POLICY` / `CREATE
   FUNCTION` success messages and no red errors. That's it — your database
   is fully set up: tables, security rules, and the secure functions the
   app uses for view/complete/reopen tracking.

This SQL file is safe to re-run if you ever need to (it drops and recreates
policies/triggers/functions before creating them again, so nothing breaks
if you run it twice).

**Already set up your database before?** If you ran an earlier version of
`schema.sql`, just paste in the current file and run it again — it will
only add what's missing (like the `task_templates`, `urgency_settings`, and
`calendar_events` tables used by the Templates, Settings, and
appointments/deliveries features) without touching your existing tasks,
profiles, or history.

---

## 4. Authentication setup

Supabase Auth is enabled by default with email/password sign-in, which is
all this app uses.

1. In the sidebar, go to **Authentication → Providers**, and confirm
   **Email** is enabled (it is by default).
2. This app deliberately has **no public sign-up page** — accounts are only
   ever created by you, the admin, from the Supabase dashboard. You can
   optionally also turn off self sign-up at the auth layer: go to
   **Authentication → Providers → Email** and disable "Allow new users to
   sign up". This isn't strictly required (the app has no sign-up UI to
   begin with), but it closes off direct API sign-up as an extra safety net.

---

## 5. Create your admin account

1. Go to **Authentication → Users** in the Supabase dashboard.
2. Click **Add user → Create new user**.
3. Fill in:
   - **Email address**: your email address.
   - **User Password**: a password you'll use to log in.
   - Check **Auto confirm user?** so you don't need to click an email confirmation link.
4. Click **Create user**.

A row is automatically created for you in the `profiles` table (via the
`handle_new_user` trigger installed by the SQL in step 3), defaulted to
`role = 'employee'` and a `full_name` guessed from your email address.
Some versions of the Supabase dashboard show an optional **User Metadata**
JSON field on this form — if you see one, you can skip the next step by
entering `{ "full_name": "Your Name", "role": "admin" }` there instead. If
you don't see that field (newer dashboards often don't show it on this
simplified form), just continue to step 5.

5. Go to **SQL Editor → New query** and run this, with your real name and
   email:
   ```sql
   update public.profiles
   set full_name = 'Your Name', role = 'admin'
   where email = 'you@example.com';
   ```

---

## 6. Create your first employee account

Repeat the same steps: **Authentication → Users → Add user**, enter their
email/password, check **Auto confirm user?**, click **Create user**. Then
in the SQL editor:

```sql
update public.profiles
set full_name = 'Employee Name', role = 'employee'
where email = 'employee@example.com';
```

(`role` is already `employee` by default, so that part of the statement is
just being explicit — it doesn't hurt to run it either way.)

That's your two accounts. No one else can sign up on their own.

---

## 7. Environment variables

The app needs two values from your Supabase project, found at
**Project Settings → API** (also called **Project Settings → Data API** in
newer dashboards):

- **Project URL** → this is `VITE_SUPABASE_URL`
- **anon / public key** (labelled "anon" / "public") → this is `VITE_SUPABASE_ANON_KEY`

Do **not** use the `service_role` key anywhere in this project — it must
never be shipped to a browser.

### Local `.env`

In the project root, copy the example file:

```bash
cp .env.example .env
```

Then edit `.env` and fill in your real values:

```
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-public-key
```

`.env` is already listed in `.gitignore`, so it will never be committed.

### Netlify environment variables

In your Netlify site: **Site configuration → Environment variables → Add a
variable**, and add both:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

with the same values as your local `.env`. (Site settings live under
**Site configuration** in newer Netlify UIs, or **Site settings** in older
ones — same place either way.)

---

## 8. Local development

```bash
npm install
npm run dev
```

Open the printed local URL (typically http://localhost:5173). Log in with
the admin account you created in step 5.

Other useful commands:

```bash
npm run build     # type-checks and builds a production bundle into dist/
npm run preview   # serves the production build locally to sanity-check it
npm run lint      # runs oxlint over src/
```

---

## 9. GitHub setup

1. Create a new, empty repository on GitHub (don't initialize it with a
   README/gitignore — this project already has both).
2. From the project folder:
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git branch -M main
   git remote add origin https://github.com/YOUR-USERNAME/YOUR-REPO.git
   git push -u origin main
   ```

---

## 10. Deploy to Netlify

1. Go to https://app.netlify.com and click **Add new site → Import an existing project**.
2. Choose **GitHub** and authorize Netlify if prompted, then pick your repository.
3. Netlify should auto-detect the settings from `netlify.toml`, but confirm:
   - **Build command**: `npm run build`
   - **Publish directory**: `dist`
4. Before deploying, add the two environment variables from step 7 (there's
   an "Add environment variables" section right on this screen, or you can
   add them afterward under **Site configuration → Environment variables**).
5. Click **Deploy site**.
6. Once the deploy finishes, open the site URL and log in.

Client-side routing (so refreshing `/calendar` or `/my-tasks` doesn't 404)
is already handled by the `[[redirects]]` rule in `netlify.toml` and the
`public/_redirects` file (both do the same thing — either one alone would
be enough, but having both is harmless and covers Netlify's various build
setups).

Every time you `git push` to `main`, Netlify will automatically rebuild and
redeploy the site.

---

## 11. Troubleshooting

**"Missing Supabase environment variables" error on load.**
Your `.env` (local) or Netlify environment variables (production) aren't
set, or you need to restart `npm run dev` / trigger a new Netlify deploy
after adding them (env vars are baked in at build time, so changing them
requires a rebuild).

**I can log in, but the app is stuck loading / "could not load your profile."**
This means the `auth.users` row exists but there's no matching row in
`public.profiles`. This can happen if a user was created before the SQL
setup ran, or the trigger didn't fire. Fix it by running this in the SQL
editor (replace the email and role):

```sql
insert into public.profiles (id, email, full_name, role)
select id, email, 'Their Name', 'employee'
from auth.users
where email = 'someone@example.com'
on conflict (id) do nothing;
```

**"Could not find the table 'public.calendar_events' in the schema cache"**
or **"Could not find a relationship between 'tasks' and 'task_recurrences'
in the schema cache"** (or a similar error naming any table/relationship
right after you run/re-run the setup SQL). This means the table or foreign
key was created successfully, but Supabase's API layer (PostgREST) is still
using a cached copy of the old schema and hasn't noticed the change yet —
it usually reloads within a few seconds, but not always instantly. Fix it
by running this one line in the SQL Editor and clicking **Run**:

```sql
notify pgrst, 'reload schema';
```

Then refresh the app. If it still doesn't show up, double-check you pasted
the **entire** `supabase/schema.sql` file (not a partial copy) and that
**Run** finished with no red errors.

**Employee can see tasks belonging to someone else, or can edit fields they shouldn't.**
This should not be possible — it's blocked by Row Level Security. If you
suspect this is happening, re-run `supabase/schema.sql` to make sure every
policy is in place (it's safe to re-run), and confirm you haven't manually
changed any policies or granted extra privileges in the dashboard.

**Calendar drag-and-drop doesn't seem to save.**
Check the browser console for an error toast/message. This usually means
the signed-in user isn't an admin (only admins can reschedule tasks), or
there's a network/connection issue with Supabase.

**Refreshing a page like `/calendar` on Netlify shows a 404.**
Confirm `netlify.toml` and `public/_redirects` were both deployed (check
the deploy's file listing) and that the publish directory is `dist`.

**Realtime updates aren't showing up on the admin's screen.**
Confirm in **Database → Replication** in the Supabase dashboard that the
`tasks` table is part of the `supabase_realtime` publication (the setup SQL
adds it automatically, but it's worth checking if you've made manual
changes).

---

## 12. Adding another employee later

1. **Authentication → Users → Add user** in Supabase, same as step 6, with
   `{ "full_name": "New Person", "role": "employee" }` in User Metadata.
2. That's it. They'll immediately show up in the **Employees** page and in
   the "Assigned to" dropdown when creating a task — no code changes, no
   redeploy, no hard-coded IDs anywhere in this app.

---

## Project structure

```
src/
  components/   Reusable UI: calendar, modals, cards, badges, layout, skeletons, offline banner
  pages/        One component per route (calendar, tasks, employees, templates, settings, my-tasks, login)
  context/      React context: auth session/profile, shared tasks state + realtime, urgency colors
  hooks/        Small data-fetching hooks (employees, task presets, task activity log, online status)
  lib/          Supabase client, all Supabase queries/RPC calls, date/urgency helpers, error messages
  types/        Shared TypeScript types (Profile, Task, TaskEvent, TaskTemplate, enums)
supabase/
  schema.sql    Everything you paste into the Supabase SQL editor
netlify.toml    Netlify build + SPA redirect configuration
public/_redirects
.env.example
```

## Task presets

Open **Templates** in the admin nav to save commonly-assigned tasks (title,
instructions, and a default urgency). When creating a new task, use the
"Start from a preset" dropdown at the top of the Add Task form to fill
everything in at once — you can still change any field, including urgency,
before saving. You can also create a preset on the fly from inside the Add
Task form itself via **+ New preset**, without losing your place.

Presets are admin-only and never shown to or usable by employees — they're
purely a shortcut for creating real tasks faster.

## Urgency colors

Open **Settings** in the admin nav to change the accent color used for each
urgency level throughout the app (calendar events, badges, filters). Labels
and icons stay fixed regardless of color, so urgency is never communicated
by color alone. Changes apply everywhere immediately (including on the
employee's screen, via Realtime) once you click **Save changes**.

## Scheduling a task at a specific time

Tasks can optionally have a due **time** as well as a due date. A few things
to know:

- Times are only offered between **8:00 AM and 8:00 PM**, in 15-minute
  increments, both in the "Due time" dropdown on the Add/Edit Task form and
  in the week/day calendar's visible time grid. This matches typical working
  hours and keeps the picker short. (A task saved elsewhere with a due time
  outside that window — e.g. via direct database access — will still show up
  correctly and remain selectable in the dropdown; it just won't be possible
  to set a new out-of-window time from the UI.)
- Clicking a specific time slot in the week or day calendar view pre-fills
  that time on the new task's form. Clicking a whole day cell in month view
  leaves the time blank (an all-day task).
- A task with a due time appears at that time slot in week/day view instead
  of as an all-day event; a task with no due time still appears as all-day
  everywhere. Dragging a timed task to a new slot in week/day view updates
  both its date and its time; dragging in month view only changes the date.

Each task on the calendar shows its title with the start of its instructions
underneath, so you can get the gist without opening it (longer text is
truncated with "…"; tasks with no instructions just show the title).

## Urgency colour-coding on the calendar

Tasks are shaded and outlined using their urgency's colour (the same colours
customizable under **Settings** — see "Urgency colors" above), in month,
week, and day view alike. Because colour alone should never be the only way
urgency is communicated, every task also shows its urgency icon next to the
title (the same icon used in the Urgency badge elsewhere in the app), and
Urgent/High tasks get a visibly thicker left accent bar than Normal/Low.
Completed tasks are shown in neutral gray regardless of urgency, since
they no longer need to stand out.

## Unviewed tasks

An open task the employee hasn't opened yet is hard to miss, on purpose:

- A gently pulsing purple **"New" pill** on the task card, on both My Tasks
  and (for the admin) the Tasks list.
- A matching pulsing dot plus a bolder title on the calendar, in every view.
- A **banner at the top of My Tasks** ("You have 3 new tasks...") whenever
  there's at least one unviewed task.
- A **badge with the count** next to "My Tasks" in the sidebar/mobile nav —
  visible from any page in the app, not just My Tasks itself.
- The **browser tab title** changes to e.g. "(3) Task Tracker" so a new task
  is noticeable even if the app isn't the active tab.

That purple colour is intentionally outside the urgency palette
(green/blue/orange/red) so "unviewed" is never confused with an urgency
level. Every one of these disappears the instant the employee opens the
task — nothing needs to be dismissed manually. (The pulsing animation
respects the OS-level "reduce motion" accessibility setting.)

## Calendar starting view

The employee's Calendar page opens on the **week** view by default (instead
of month), since a week at a glance is usually more useful day-to-day. The
admin's calendar still opens on month view. Either can switch views anytime
using the month/week/day buttons at the top right of the calendar.

On a phone-sized screen (roughly 640px wide or narrower — basically any
phone), both the admin and employee calendars open on the **day** view
instead, regardless of the above — a 7-column month or week grid squeezes
each day into a sliver too narrow to actually read on a phone. Day view
shows one day at a time, full width, with its tasks/appointments stacked
down the hours of the day — scroll down to see later in the day, and use
the Day/Week/Month buttons to switch manually anytime. This is decided once
when the calendar loads, not re-decided every time you rotate the phone or
resize a window, so it won't yank the view out from under you mid-use.

## Installing it like an app (mobile)

The site can be added to a phone's home screen and opens full-screen from
there — no Safari address bar or toolbar, on every page, just like a
regular app icon.

**On iPhone/iPad (Safari):** open the site, tap the **Share** button (the
square with an arrow pointing up), scroll down and tap **Add to Home
Screen**, then tap **Add**. An icon appears on the home screen; tapping it
opens the app full-screen.

**On Android (Chrome):** open the site, tap the **⋮** menu, then **Add to
Home screen** (or **Install app**, if Chrome offers it directly).

Note this is intentionally a simple installable shortcut, not an offline
app — it always loads the latest live version over the network rather than
caching pages, so you'll never see a stale version stuck on a home screen
icon after an update goes out.

## Appointments & deliveries

Unlike tasks (which only an admin creates and assigns), **any signed-in
user — employee or admin — can add an appointment or delivery** to the
shared calendar:

- On the Calendar page, click **+ Appointment/Delivery** — or click directly
  on a day (month view) or a time slot (week/day view). Since everyone can
  now add both tasks and appointments/deliveries, clicking a day/time shows
  a small "Task" vs. "Appointment/Delivery" chooser first, so a single click
  still works even though there are two things it could mean.
- Either way, pick a type (Appointment 🗓️ or Delivery 📦), give it a title,
  optional notes, a date, and an optional time (same 8 AM–8 PM picker as
  tasks).
- Everyone — every employee and the admin — sees every entry, in month,
  week, and day view, so people don't double-book a delivery slot or miss
  an appointment someone else scheduled.
- Every entry always shows **who added it** — its icon, title, and a small
  "— Name" line right on the calendar, plus full details (added by, added
  when) when you open it.
- Only the person who added an entry, or the admin, can edit or delete it.
  Everyone else can see it but not touch it.
- These are informational calendar entries, not tasks — they have no
  assignee, no urgency, and no viewed/completed tracking. They're coloured
  in a neutral slate/stone tone, distinct from both the urgency palette and
  the unviewed-task purple, so they read as "shared info" rather than "a
  task for me."

## Employees adding their own tasks

An employee isn't limited to tasks the admin assigns them — they can add
their own personal to-dos too, right alongside admin-assigned tasks on the
same calendar and task list:

- On the employee's Calendar page, click **+ Add Task** — or click directly
  on a day/time slot the same way you'd add an appointment/delivery; since
  employees can now create both tasks and appointments/deliveries, clicking
  a day/time shows the same small chooser popover an admin sees.
- On the employee's **My Tasks** page, click **+ Add Task** at the top.
- Either way, the form is simplified for a self-added task: there's no
  "Assigned to" picker (it's automatically you) and no preset/template
  picker — just a title, optional notes, urgency, due date, and optional
  time.
- A self-added task behaves exactly like any other task on your list — mark
  it **Complete**, **Reopen** it, and it shows up in the Overdue/Today/This
  Week/Future/Completed sections the same way. You can also edit or delete
  a task you added yourself (unlike an admin-assigned task, which only the
  admin can edit or delete).
- The admin sees every self-added task too, labeled **"Self-added by
  {name}"** instead of "Assigned to {name}", so it's always clear at a
  glance which tasks the admin assigned versus which ones an employee added
  for themselves.

## Recurring tasks

Either the admin or the employee can make a task repeat automatically, so
you don't have to recreate the same task every day/week/month:

- When adding a task (any of the places above — Add Task, the calendar's
  quick-create chooser, My Tasks), there's a **Repeat** field: "Does not
  repeat", **Daily**, **Every weekday (Mon–Fri)**, **Weekly** (same day of
  the week as the due date you picked), or **Monthly** (same date each
  month — if a month doesn't have that date, e.g. the 31st in February, it
  lands on that month's last day instead).
- The Repeat field only shows up when *creating* a task, not editing one —
  editing an existing task (title, urgency, due date, whatever) only ever
  changes that one occurrence, never the whole series. This keeps editing
  simple and predictable: it works exactly the same whether the task
  repeats or not.
- Occurrences are generated automatically about 60 days ahead, and top up
  again every time either of you opens the app — so you never have to
  "generate more," it just always has the next couple of months ready.
- Every generated occurrence is a completely normal task: mark it
  **Complete**, **Reopen** it, **Edit** it, or **Delete** it, same as any
  other task, and it shows up in the calendar and My Tasks sections the
  same way. A small 🔁 shows next to its title so it's clear at a glance
  that it's part of a series.
- To end a series, open any occurrence and click **Stop repeating**. That
  task stays as it is, but no more occurrences will be created, and any
  other still-open upcoming occurrences are removed — anything already
  completed stays in your history. Only the person who set up the
  recurrence (or the admin) can stop it.

## How the security model works (short version)

- Every table has Row Level Security **enabled**, and access is granted only
  through explicit policies — nothing is accessible by default.
- Admins are identified by an `is_admin()` SQL function (checked against
  `profiles.role`), used throughout the policies.
- Employees get a `SELECT` policy scoped to `assigned_to = auth.uid()` — they
  can only ever see their own tasks.
- Employees have **no UPDATE (or INSERT/DELETE) policy on tasks an admin
  assigned to them.** The only way an employee can change the state of an
  admin-assigned task is by calling one of three narrowly scoped Postgres
  functions — `mark_task_viewed`, `complete_task`, `reopen_task` — each of
  which independently re-checks `auth.uid()` against the task's
  `assigned_to` before touching anything, and only ever writes to the
  specific viewing/completion columns using the database's own clock
  (`now()`), never a value passed in from the browser.
- The one exception is a **self-created task** — one an employee added for
  themselves, rather than one an admin assigned. The database recognizes
  this by a simple rule: `created_by` and `assigned_to` are both the
  employee's own id. Only under that exact condition can an employee
  `INSERT`, `UPDATE`, or `DELETE` a task directly — and the `WITH CHECK`
  clause on the UPDATE policy re-enforces the same rule on every edit, so an
  employee can never use it to reassign a task to someone else or "adopt"
  a task an admin assigned them.
- `task_events` (the activity log) has no INSERT policy for regular users at
  all — every row is written either by a trigger on `tasks` or from inside
  the SECURITY DEFINER functions above, so it can't be forged by a client.
- An additional trigger locks `id`, `created_by`, and `created_at` on every
  `tasks` row so they can never be rewritten by anyone, even an admin, once
  set.
- `calendar_events` (appointments/deliveries) works differently on purpose:
  everyone can `SELECT` every row (it's a shared calendar), any signed-in
  user can `INSERT` but only attributed to themselves (`created_by` must
  equal their own id — spoofing another user's name is rejected by the
  database, not just hidden in the UI), and only the creator or an admin can
  `UPDATE`/`DELETE` a given entry. The same immutable-fields trigger pattern
  as `tasks` stops anyone — even the creator — from rewriting `id`,
  `created_by`, or `created_at` after the fact.
- `task_recurrences` (the repeating-task definitions) follows the exact same
  admin-or-self rule as `tasks`: an admin can start a recurrence assigned to
  anyone, an employee can only start one assigned to themselves, and only
  the recurrence's own creator or an admin can update or stop it. The
  occurrences it generates are ordinary `tasks` rows, so once created they're
  governed entirely by the `tasks` policies above — a recurrence doesn't
  grant any special access to the tasks it produces.
- `ensure_recurring_task_instances()` (the function that generates upcoming
  occurrences) is callable by any signed-in user, which is safe because it
  never accepts data from the caller — it only expands recurrence rows that
  were already created through the authorized policies above, using the
  database's own clock to decide what's due. `stop_task_recurrence()`
  double-checks the caller is the recurrence's creator or an admin before
  touching anything, the same pattern as `complete_task`/`reopen_task`.

This has been tested directly against Postgres with RLS enabled (not just
through the app) — including confirming that an employee's direct
`UPDATE`/`INSERT`/`DELETE` attempts against an **admin-assigned** task are
rejected or silently affect zero rows, that a second employee cannot see or
act on a task assigned to someone else, that one employee cannot edit or
delete another employee's appointment/delivery (nor post one under a false
name), that the admin can still manage any calendar entry regardless of who
created it, that an employee *can* create/edit/complete/delete their own
self-created task, that they cannot use that same path to spoof
`created_by`, assign a self-created task to someone else, or touch an
admin-assigned task, that the admin can see and correctly label every
self-created task, that an employee cannot see or start a recurrence
assigned to a coworker, that generated occurrences land on the right dates
for daily/weekly/monthly/weekday recurrences (including month-end dates like
starting on the 31st, and a weekday-only series that starts on a weekend),
and that stopping a recurrence removes its upcoming open occurrences while
preserving completed ones as history.

## Test checklist

- [ ] Admin can log in and lands on the Calendar.
- [ ] `+ Add Task` creates "Move teak dresser", assigned to the employee, due
      tomorrow, urgency Urgent — and it appears on the calendar in red.
- [ ] Employee logs in, lands on **My Tasks**, and sees the task under
      "Today"/"This Week"/"Future" (or "Overdue" once its deadline passes).
- [ ] Before opening it, the admin's task details show "Not viewed yet."
- [ ] Employee opens the task; admin's view now shows an exact viewed
      timestamp.
- [ ] Employee taps **Mark Complete**; the task details popup closes right
      away, and the admin's view immediately shows it as completed with an
      exact timestamp (no refresh needed, via Realtime).
- [ ] Admin reopens the task from the details view; it becomes active again.
- [ ] The Activity tab on the task shows the full history: created, viewed,
      completed, reopened.
- [ ] Dragging a task to a new date on the admin calendar prompts for
      confirmation, then updates the due date.
- [ ] Deleting a task prompts for confirmation first.
- [ ] An employee visiting `/employees` or `/tasks` directly is redirected
      away rather than shown the admin page.
- [ ] The list view's filters (All/Open/Completed/Due today/Overdue/Not
      viewed/Viewed/Urgent/Completed today) and search work as expected.
- [ ] Clicking a time slot in the week or day calendar view (not just a whole
      day) opens the Add Task form with that time pre-filled.
- [ ] A task with a due time shows up at that time in week/day view, not as
      an all-day event; dragging it to a new slot updates both the date and
      the time shown on the task.
- [ ] The Due time dropdown only offers times between 8:00 AM and 8:00 PM,
      and the week/day calendar's visible hours are limited to that range.
- [ ] On the Calendar page, clicking each of the four summary tiles (Due
      today, Overdue, Not viewed, Completed today) opens the Tasks page
      pre-filtered to that category.
- [ ] A task with instructions shows a preview of that text under its title
      on the calendar, in month, week, and day view.
- [ ] Tasks of different urgencies show visibly different colours (and the
      matching icon next to the title) on the calendar in every view;
      completed tasks always show as neutral gray instead.
- [ ] An employee logging in and opening the Calendar page lands on the
      **week** view, not month (the admin's calendar still opens on month).
- [ ] An unviewed task shows a pulsing "New" pill on its card and a small
      pulsing corner dot on the calendar; both disappear once the employee
      opens it.
- [ ] With at least one unviewed task, the employee sees a purple banner at
      the top of My Tasks, a numbered badge next to "My Tasks" in the nav,
      and the browser tab title shows the count (e.g. "(2) Task Tracker").
      All three go away once every task has been opened.
- [ ] On **My Tasks**, a task due later this week appears under "This Week"
      and a task due next week or later appears under "Future" — two
      separate sections instead of one combined "Upcoming" list.
- [ ] The app is usable on a phone-sized screen, and "Mark Complete" is easy
      to tap.
- [ ] Creating a preset under **Templates**, then selecting it from "Start
      from a preset" in the Add Task form, fills in the title/description/
      urgency (still editable before saving).
- [ ] Changing a color under **Settings** and clicking **Save changes**
      updates that urgency's color on the calendar and badges right away.
- [ ] Logging in with the wrong password shows a plain-language error, not
      raw Supabase text.
- [ ] Turning off Wi-Fi/network shows the "You're offline" banner.
- [ ] An employee clicks **+ Appointment/Delivery**, adds a delivery for
      tomorrow at 1pm; it appears on their calendar showing the delivery
      icon and their own name, and shows up on the admin's calendar too
      (and on a second employee's, if you have one) without a refresh.
- [ ] Opening someone else's appointment/delivery shows its details but with
      no Edit/Delete buttons; opening your own (or, as admin, anyone's)
      shows Edit and Delete.
- [ ] Editing your own appointment/delivery's date updates it on the
      calendar for everyone; deleting it removes it for everyone.
- [ ] As an employee or admin, clicking a day/time slot on the calendar shows
      a small "+ Task" / "+ Appointment/Delivery" chooser; picking either
      opens the right form with the date/time pre-filled, and clicking
      elsewhere or pressing Esc dismisses the chooser without creating
      anything.
- [ ] As an employee, clicking **+ Add Task** on the Calendar page or **+ Add
      Task** on My Tasks opens a simplified Add Task form — titled "Add my
      task", with no "Assigned to" picker and no preset picker.
- [ ] Saving that form creates a task assigned to yourself; it appears
      immediately on your calendar and in My Tasks, already marked as
      viewed (no "New" pill).
- [ ] You can Mark Complete, Reopen, Edit, and Delete a task you added
      yourself, the same as an admin can for any task.
- [ ] Opening an admin-assigned task as the employee it's assigned to shows
      **no** Edit/Delete buttons (only Mark Complete/Reopen) — only a
      self-added task gets Edit/Delete.
- [ ] The admin sees a self-added employee task on their Calendar and Tasks
      list; opening it shows "Self-added by {employee name}" instead of
      "Assigned to {employee name}", and the admin can also edit/delete/
      complete it like any other task.
- [ ] A second employee cannot see the first employee's self-added task
      anywhere (not on their calendar, not via a direct link) — only the
      admin and the employee who added it can see it.
- [ ] Adding a task with **Repeat: Daily** creates today's task immediately,
      and it (or its 🔁 icon) is visible right away on the calendar and in
      the task list.
- [ ] The **Repeat** field only appears when adding a new task, not when
      editing an existing one.
- [ ] Editing one occurrence of a repeating task (e.g. changing its title or
      urgency) only changes that occurrence — other upcoming occurrences in
      the series keep their original title/urgency.
- [ ] A **Weekly** recurrence's occurrences all land on the same day of the
      week as the one you first picked; a **Monthly** one lands on the same
      date each month (and on the last day of shorter months, if you started
      on the 29th/30th/31st); **Every weekday** never lands on a Saturday or
      Sunday, even if you started the series on one.
- [ ] Opening a repeating task shows "🔁 Repeats {frequency}" and a **Stop
      repeating** button; opening a non-repeating task shows neither.
- [ ] Clicking **Stop repeating** and confirming removes the other upcoming,
      not-yet-completed occurrences of that series from the calendar/task
      list, but leaves the occurrence you were viewing (and any already
      completed ones) in place.
- [ ] After stopping a series, no new occurrences reappear later (e.g. after
      logging out and back in).
- [ ] Both the admin and an employee can independently start their own
      recurring task, and each only sees/manages their own series (the
      employee can't stop or edit a recurring task the admin created for
      them beyond the normal per-occurrence Mark Complete/Reopen).
- [ ] On an iPhone, Safari's **Share → Add to Home Screen** adds an icon
      with the app's actual logo (not a blank/generic icon); tapping it
      opens the app full-screen with no address bar or Safari toolbar
      visible on *any* page, including Calendar.
- [ ] On a phone-width screen, the Calendar page opens showing a single day
      (not a squeezed week/month grid), with today's tasks/appointments
      readable at a glance; the Day/Week/Month buttons still let you switch
      views manually.
- [ ] On a normal desktop-width browser window, the calendar's default view
      is unchanged from before (admin: month, employee: week).
