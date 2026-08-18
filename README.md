# Mid Haven Furniture

A simple, calendar-based task tracker for assigning work to an employee and
verifying it was actually seen and done. Built with React, TypeScript, Vite,
and Supabase (Postgres + Auth + Row Level Security + Realtime), deployed on
Netlify.

Core workflow: **Assign → View → Complete → Verify.**

Also included: reusable **task presets** (save a common task once, pick it
from a list instead of retyping it), admin-**customizable urgency colors**
(both under the admin's **Templates** and **Settings** nav items), a
shared **appointments/deliveries calendar** any employee or admin can add
to directly, **due-soon flashing** so nothing slips through at the last
minute, per-task **photos and notes**, a **light/dark theme** toggle,
**push notifications** for assigned/due-soon/overdue tasks, a **read-only
calendar subscribe feed** for Apple/Google/Outlook Calendar, self-service
**password reset**, and a set of quality-of-life touches — toast
confirmations, bulk task actions, swipe-to-complete/delete on mobile, task
duplication, and search/filters throughout.

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

**Updating from a version before task notes/photos?** The current
`schema.sql` also adds two new tables (`task_comments` and `task_photos`)
and a new public Storage bucket (`task-photos`) used by the **Notes** and
**Photos** sections on a task's details. As always, re-running the
**entire** file (not a partial snippet) is what picks these up — copy the
whole `supabase/schema.sql` into a new SQL Editor query and click **Run**
again, exactly like step 3 above. This is safe and won't touch any
existing data. If the app still can't find `task_comments`/`task_photos`
right after running it, see the schema-cache troubleshooting entry below.

**Updating from a version before dark mode/push/calendar sync/password
reset?** The current `schema.sql` also adds a `feed_token` column on
`profiles` (calendar sync), a `push_subscriptions` table and a
`task_push_log` table (push notifications), and a couple of small helper
functions/triggers for both. Same deal — paste the whole file in and run it
again. The dark mode, "Forgot password?", and calendar-sync-link UI all work
immediately after that; **push notifications additionally need one Edge
Function deployed** before they'll actually deliver anything — see "Setting
up push notifications" below.

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
3. For the **"Forgot password?"** link on the login page to work, go to
   **Authentication → URL Configuration** and add your site's reset-password
   page to **Redirect URLs** — e.g. `https://your-site.netlify.app/reset-password`
   for production, and `http://localhost:5173/reset-password` too if you
   want it to work while running locally (`npm run dev`). Without this,
   Supabase rejects the redirect and the emailed link won't land anywhere
   useful.

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

A third, optional value — `VITE_VAPID_PUBLIC_KEY` — is only needed if you
set up push notifications; see step 15 further down. Skip it for now if
you're not there yet.

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
   Add the third, optional one from step 15 too if you've already set up
   push notifications — otherwise it's fine to add it later and redeploy.
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

**Uploading a task photo fails, or an uploaded photo shows a broken image.**
This usually means the `task-photos` Storage bucket or its policies weren't
created — confirm you ran the **entire, current** `supabase/schema.sql`
(see the update note in step 3), then check **Storage** in the Supabase
dashboard sidebar for a bucket named `task-photos`. If it's missing, re-run
the full SQL file again; it's safe to re-run.

**Realtime updates aren't showing up on the admin's screen.**
Confirm in **Database → Replication** in the Supabase dashboard that the
`tasks` table is part of the `supabase_realtime` publication (the setup SQL
adds it automatically, but it's worth checking if you've made manual
changes).

**Clicking "Forgot password?" doesn't send an email, or the link goes nowhere.**
Confirm you completed step 4.3 (adding `/reset-password` to **Authentication
→ URL Configuration → Redirect URLs**) with the *exact* URL you're testing
from (including `http://localhost:5173` if testing locally — it needs its
own entry, separate from the production one). Also check spam, and that the
email address you typed actually matches an existing account — the app
deliberately shows the same "if an account exists..." message either way,
so a mistyped email won't visibly fail.

**Calendar app shows no events / "could not subscribe" on the calendar link.**
Confirm you deployed the Edge Function in step 14
(`supabase functions deploy calendar-feed --no-verify-jwt`) — visiting the
link directly in a browser should download/display a `.ics` file rather
than showing an error page. If it 404s, the function isn't deployed yet; if
it 400/401s, double check `--no-verify-jwt` was included when deploying.

**Push notifications never arrive.**
Walk through step 15 in order — the most common misses are: the Edge
Function deployed without `--no-verify-jwt`, the VAPID keys/`CRON_SECRET`
not set as *function* secrets (`supabase secrets set`, not the `.env` file),
`pg_cron`/`pg_net` not actually enabled (check **Database → Extensions**),
or on iPhone/iPad, testing from a plain Safari tab instead of the
Home-Screen-installed app (Apple requires the install — see the note at the
end of step 15). You can sanity-check the function itself independent of
the schedule with the `curl` command at the end of step 15 — if that
delivers a notification, the function/keys are fine and the issue is in the
`cron.schedule(...)` call (double-check the URL and `x-cron-secret` value
match exactly).

---

## 12. Adding another employee later

1. **Authentication → Users → Add user** in Supabase, same as step 6, with
   `{ "full_name": "New Person", "role": "employee" }` in User Metadata.
2. That's it. They'll immediately show up in the **Employees** page and in
   the "Assigned to" dropdown when creating a task — no code changes, no
   redeploy, no hard-coded IDs anywhere in this app.

---

## 13. Edge Functions setup (needed for push notifications and/or calendar sync)

Both of the next two sections need one small piece of server-side code
running on Supabase's side — something that can't be done from inside the
SQL editor, so it needs the Supabase CLI. If you don't want either feature
yet, skip straight to "Project structure" below; everything else in the app
works fine without it.

1. Install the CLI (needs Node, which you already have from step 1):
   ```bash
   npm install -g supabase
   ```
2. From the project folder, log in and link it to your project (find your
   project ref in the Supabase dashboard URL, `https://supabase.com/dashboard/project/<this-part>`):
   ```bash
   supabase login
   supabase link --project-ref your-project-ref
   ```

Keep this terminal open — both sections below deploy from here.

---

## 14. Calendar sync (optional)

Deploy the one Edge Function this needs:

```bash
supabase functions deploy calendar-feed --no-verify-jwt
```

(`--no-verify-jwt` is required here — calendar apps subscribing by URL can't
send an Authorization header, so the function has to be reachable without
one. It's still not guessable/public in a meaningful sense: it only returns
anything for a valid `?token=...`, and that token is a random UUID unique to
each person.)

That's it — no secrets, no scheduling. In the app, every user (admin or
employee) now has a **Notifications** page in the nav with a **Calendar
sync** section showing their personal subscribe link and instructions for
Apple Calendar, Google Calendar, and Outlook. If someone's link ever leaks,
they can regenerate it from that same page — the old link stops working
immediately.

---

## 15. Push notifications (optional)

This one needs a few more pieces: a keypair so only your server can send
notifications claiming to be your app (VAPID), and a scheduled job that
periodically checks for tasks that just became assigned/due-soon/overdue.

1. Generate a VAPID keypair (needs Node):
   ```bash
   npx web-push generate-vapid-keys
   ```
   This prints a **Public Key** and a **Private Key**. Keep this output
   around for the next two steps.

2. Deploy the scheduled-check function:
   ```bash
   supabase functions deploy check-due-tasks --no-verify-jwt
   ```
   (`--no-verify-jwt` again, for the same reason — pg_cron, below, can't
   send an Authorization header either. `CRON_SECRET`, set next, is what
   actually keeps this one from being triggered by a stranger.)

3. Set the function's secrets (paste in your own values — `CRON_SECRET` can
   be any random string you make up, e.g. run
   `node -e "console.log(crypto.randomUUID())"` for one):
   ```bash
   supabase secrets set \
     VAPID_PUBLIC_KEY=your-public-key-from-step-1 \
     VAPID_PRIVATE_KEY=your-private-key-from-step-1 \
     VAPID_SUBJECT=mailto:you@example.com \
     BUSINESS_TIMEZONE=America/Chicago \
     CRON_SECRET=some-random-string-you-make-up
   ```
   `BUSINESS_TIMEZONE` is any [IANA timezone name](https://en.wikipedia.org/wiki/List_of_tz_database_time_zones)
   (e.g. `America/New_York`, `America/Chicago`, `America/Los_Angeles`) — the
   rest of the app treats every due date/time as "local to whoever's
   looking at it" (see the comment at the top of `src/lib/dates.ts`), but a
   scheduled job checking due dates in the middle of the night has no
   "whoever's looking" to borrow a timezone from, so it needs one explicit
   value for your shop.

4. Add the **public** key only to your frontend env vars — this one's safe
   to expose in browser code, unlike the private key above:
   - Local `.env`: `VITE_VAPID_PUBLIC_KEY=your-public-key-from-step-1`
   - Netlify: **Site configuration → Environment variables**, add
     `VITE_VAPID_PUBLIC_KEY` with the same value, then trigger a new deploy
     (env vars are baked in at build time).

5. Enable two Postgres extensions the scheduled check relies on. `schema.sql`
   already tries to enable `pg_net` for you; if that failed silently (some
   projects restrict it from the SQL editor) or you still need `pg_cron`, go
   to **Database → Extensions** in the Supabase dashboard and enable both
   `pg_net` and `pg_cron` there instead.

6. Schedule the periodic check — in **SQL Editor → New query**, filling in
   your project ref and the same `CRON_SECRET` from step 3:
   ```sql
   select cron.schedule(
     'check-due-tasks-push',
     '*/5 * * * *',
     $$
     select net.http_post(
       url := 'https://your-project-ref.supabase.co/functions/v1/check-due-tasks',
       headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', 'some-random-string-you-make-up'),
       body := '{}'::jsonb
     );
     $$
   );
   ```
   This runs every 5 minutes. To change the frequency later, re-run
   `select cron.unschedule('check-due-tasks-push');` followed by the
   `cron.schedule(...)` call again with a different `'*/5 * * * *'`.

7. Test it: open the app's **Notifications** page and click **Enable
   notifications on this device**, allow the browser permission prompt, then
   either wait up to 5 minutes for the next scheduled run or trigger one
   immediately from a terminal:
   ```bash
   curl -X POST https://your-project-ref.supabase.co/functions/v1/check-due-tasks \
     -H "x-cron-secret: some-random-string-you-make-up"
   ```
   You should get a notification for any task assigned to you (every task
   gets exactly one "assigned" push the first time this function ever sees
   it — so your very first run will likely notify you about every existing
   open task at once; that's expected and only happens the once).

**iPhone/iPad note:** Safari only supports push notifications for a site
that's been **added to the Home Screen** first (Share → Add to Home Screen —
see "Installing it like an app" above) — a regular Safari tab can't receive
them, that's an Apple restriction, not something this app can work around.
Desktop browsers and Android Chrome support it directly in a normal tab, no
install required.

---

## Project structure

```
src/
  components/   Reusable UI: calendar, modals, cards, badges, layout, skeletons, offline banner, toasts,
                task notes, task photos, theme toggle
  pages/        One component per route (calendar, tasks, employees, templates, settings, my-tasks, login,
                reset-password, notifications)
  context/      React context: auth session/profile, shared tasks state + realtime, urgency colors, toasts,
                light/dark theme
  hooks/        Small data-fetching hooks (employees, task presets, task activity log, online status,
                task comments, task photos, push notification status, calendar feed link)
  lib/          Supabase client, all Supabase queries/RPC calls, date/urgency helpers, error messages,
                Web Push helpers
  types/        Shared TypeScript types (Profile, Task, TaskEvent, TaskTemplate, PushSubscriptionRecord, enums)
supabase/
  schema.sql    Everything you paste into the Supabase SQL editor
  functions/    Edge Functions (see steps 14-15): calendar-feed (.ics feed), check-due-tasks (scheduled push)
public/
  sw.js         Service worker — only handles push notifications, no offline caching
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

Tapping a preset in the Templates list opens a quick view of it (its full
instructions and urgency) with **Edit**, **Delete**, and **Close** — the
same look-before-you-touch pattern as opening a task.

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
- The **browser tab title** changes to e.g. "(3) Mid Haven Furniture" so a new task
  is noticeable even if the app isn't the active tab.

That purple colour is intentionally outside the urgency palette
(green/blue/orange/red) so "unviewed" is never confused with an urgency
level. Every one of these disappears the instant the employee opens the
task — nothing needs to be dismissed manually. (The pulsing animation
respects the OS-level "reduce motion" accessibility setting.)

## Due-soon flashing

An open (not completed) task starts **flashing an amber ring** as its
deadline gets close, everywhere it appears — the task card on My Tasks/the
Tasks list, the FullCalendar grid on desktop, and the agenda list on the
phone calendar — plus a matching amber **"Due soon" pill** and a "Due soon"
status in the task details view. This is a separate signal from "Overdue"
(red) and "New/unviewed" (purple) — a task only ever shows one of the three
at a time (once it's actually overdue, the flashing stops and the red
"Overdue" styling takes over instead).

The same amber flashing and "Due soon" pill also apply to **appointments
and deliveries** on the calendar (desktop, phone agenda, and the entry's
own details view) as their date/time approaches, since a missed delivery
slot matters just as much as a missed task.

"Due soon" means:

- A task or appointment/delivery **with a specific time** starts flashing 2
  hours before that time.
- One **with no specific time** (just a date) starts flashing for its
  entire date, since there's no narrower time window to measure against.

This updates live — a task starts (and stops) flashing on its own as time
passes, even if you don't touch anything else in the app, so leaving the
Calendar or My Tasks page open through the day is enough to catch it. (Like
the unviewed-task pulse, this respects the OS-level "reduce motion"
accessibility setting.)

## Closing pop-ups

Every pop-up (task details, appointment/delivery details, the Add/Edit
forms, presets, confirmation prompts, and the photo viewer) can be closed
three ways: the **×** in its top-right corner, a clearly-bordered **Close**
(or **Cancel**) button, or by clicking/tapping anywhere outside it. All
three do the same thing everywhere in the app.

## Opening a form doesn't pop the keyboard

Opening **Add Task**, **Add my task**, **Add appointment or delivery**, or
**New preset** moves focus into the pop-up so keyboard/screen-reader users
land inside it right away, but it doesn't put the cursor directly into the
Title field — that would trigger the on-screen keyboard the instant the form
opens on a phone or tablet, before you've even seen what's on it. Tap the
Title field (or Tab to it on a computer) when you're ready to type.

## Dropdowns

Every dropdown in the app (urgency, assignee, repeat frequency, appointment
vs. delivery, filters, the time picker) is custom-built to match the rest
of the app, rather than your browser/OS's plain default menu — same click,
same keyboard behavior (arrow keys to move, Enter/Space to pick, Escape to
cancel, typing a letter jumps to a matching option), just styled
consistently everywhere. It also flips to open upward instead of downward
when there isn't enough room below it (e.g. a field near the bottom of a
tall form on a short screen).

## Calendar day hover

On a computer (anything with a mouse, not a touchscreen), hovering over a
day in month view — or a day column in week/day view — highlights it, as a
visual hint that clicking there opens the add-task/appointment form. This
doesn't apply on phones/tablets, since there's no hover gesture to match
there — tapping already does the same thing.

## Dark mode

Every user picks their own theme independently — **Light**, **Dark**, or
**Match system** — from the dropdown in the sidebar (desktop) or the ☰ menu
(mobile), below the nav links. **Match system** follows your OS/browser's
own light/dark setting automatically, including switching live if it
changes (e.g. an OS-level auto-dark-at-sunset schedule) without needing a
page reload. The choice is remembered per-browser and applies instantly,
with no flash of the wrong theme on reload.

## Calendar starting view

The employee's Calendar page opens on the **week** view by default (instead
of month), since a week at a glance is usually more useful day-to-day. The
admin's calendar still opens on month view. Either can switch views anytime
using the month/week/day buttons at the top right of the calendar.

### Phone calendar (Apple Calendar-style)

On a phone-sized screen (roughly 640px wide or narrower — basically any
phone), both the admin and employee calendars switch to a completely
different, compact layout modeled on the iPhone's built-in Calendar app,
instead of squeezing FullCalendar's month/week grid into a sliver too
narrow to read:

- A small **month grid** up top shows just day numbers, with a tiny coloured
  dot under any day that has a task or appointment/delivery — no event text
  crammed into the cells. Tap a **Month/Week** toggle to switch to a
  horizontally-scrollable week strip instead, same dots. Swipe left/right on
  the grid (or use the ‹ › arrows) to move to the next/previous month or
  week; tap **Today** to jump back to today.
- Tapping any day selects it — shown as a filled blue circle around the day
  number — and its tasks and appointments/deliveries list out below the
  grid, sorted by time, each tappable to open the same details view as
  everywhere else. Tap the **+** button next to the date to add a task or
  appointment/delivery for that day.

This layout is decided once when the calendar loads, not re-decided every
time you rotate the phone or resize a window, so it won't change out from
under you mid-use. On tablet and desktop widths, the calendar is still the
full FullCalendar month/week/day grid described above.

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

### Mobile navigation

On a phone-width screen, navigation lives behind a **☰ menu button** in the
top right, instead of a full sidebar (which only fits on wider screens) or
a bottom tab bar. Tapping it opens a small dropdown with the same
pages/links as the desktop sidebar, plus your name/role and **Log out** at
the bottom; tapping a link, tapping outside the menu, or pressing Esc
closes it again. The same "New" badge that shows on **My Tasks** in the
desktop sidebar also shows here — as a small dot on the menu button itself
before you open it, and as a number next to My Tasks once it's open.

The menu button itself is sized for an easy thumb tap. The **Mid Haven
Furniture** name next to it (and the same name at the top of the desktop
sidebar) is a link back to your own task list — the Tasks page for the
admin, My Tasks for an employee — a quick way home from anywhere in the
app.

## Appointments & deliveries

Unlike tasks (which only an admin creates and assigns), **any signed-in
user — employee or admin — can add an appointment or delivery** to the
shared calendar:

- On the Calendar page, click **+ Appointment/Delivery** — or click directly
  on a day (month view) or a time slot (week/day view). Since everyone can
  now add both tasks and appointments/deliveries, clicking a day/time shows
  a small "Task" vs. "Appointment/Delivery" chooser first, so a single click
  still works even though there are two things it could mean.
- Either way, pick a type (Appointment ◆ or Delivery ■), give it a title,
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
  it **Complete**, **Reopen** it, and it shows up in the Overdue/Today/day-by-
  day/future-week/Completed sections the same way. You can also edit or delete
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
  same way. A small ↻ shows next to its title so it's clear at a glance
  that it's part of a series.
- To end a series, open any occurrence and click **Stop repeating**. That
  task stays as it is, but no more occurrences will be created, and any
  other still-open upcoming occurrences are removed — anything already
  completed stays in your history. Only the person who set up the
  recurrence (or the admin) can stop it.

## Notifications, filters & shortcuts

A handful of quality-of-life additions on top of the core workflow:

- **Toast confirmations.** Saving a task, template, calendar entry, or
  settings change; completing, reopening, or deleting a task; stopping a
  recurrence — each shows a brief toast notification in the corner
  confirming what just happened, so it's obvious an action actually took
  effect even before the underlying list updates.
- **Confirm before losing unsaved changes.** Closing the Add/Edit Task form
  (via Close, the overlay, or Esc) after you've typed something prompts
  "Discard changes?" instead of silently throwing your edits away. Closing
  without having changed anything just closes normally.
- **Confirm before resetting urgency colors.** The **Reset to defaults**
  button on the Settings page now asks for confirmation first instead of
  resetting immediately.
- **Duplicate task.** Opening a task's details shows a **Duplicate**
  button (wherever Edit/Delete are shown) that opens the Add Task form
  pre-filled with the same title, instructions, assignee, and urgency, but
  today's date as the due date — handy for "do this again" without
  retyping everything.
- **Clickable employee stats.** On the **Employees** page, an employee's
  name and each of their Open/Overdue/Completed counts are links straight
  into the Tasks list, pre-filtered to that employee (and, for the counts,
  that status too).
- **Bulk actions on the Tasks list.** Click **Select** at the top of the
  admin Tasks list to check multiple tasks at once, then **Complete**,
  **Reassign**, or **Delete** them together from a floating action bar at
  the bottom (Delete and Reassign ask for confirmation/a target employee
  first). Click **Cancel** to leave selection mode.
- **Swipe actions on task cards (phone).** On a touch screen, swiping a
  task card right reveals a green **Complete** action; swiping left
  reveals a red **Delete** action (with a confirmation prompt). Only shows
  up for actions you actually have permission to take on that task — the
  same rules as the buttons inside the task's details view. Tapping the
  card (rather than swiping) still opens it as usual; this has no effect
  on a desktop mouse.
- **Search on My Tasks.** A search box above the task sections filters by
  title/description as you type; the summary stat tiles above it always
  reflect your *whole* task list, not just the filtered results, so you
  can still see your true Overdue/Today/This Week/Completed counts while
  narrowing the list below.
- **My Tasks summary tiles.** Four tiles (Overdue, Due today, This week,
  Completed) sit above the task list, mirroring the calendar's summary
  tiles; tapping one jumps straight to that section instead of just
  displaying a number.
- **My Tasks day-by-day and future-week breakdown.** Below Overdue and
  Today, the rest of the current week (tomorrow through Saturday) is broken
  out one section per day — "Tomorrow", then each remaining weekday by name
  (e.g. "Wednesday", "Thursday") — so you can see exactly what's due on
  which day at a glance instead of one lumped-together list. After that,
  the next three calendar weeks each get their own section too — "Next week
  (Aug 23 – Aug 29)", "In 2 weeks (...)", "In 3 weeks (...)" — using the
  same Sunday–Saturday week boundaries as the calendar. A task due further
  out than that isn't shown on My Tasks at all (it'll appear once it falls
  inside that window on a later visit, or you can always find it on the
  Calendar); an empty day or week section is simply skipped rather than
  shown with a "0".

## Task notes & photos

Opening any task's details now also shows two extra sections, visible to
both the admin and the employee it's assigned to (not admin-only, unlike
the Activity log):

- **Photos** — attach one or more photos to a task (e.g. a finished-piece
  photo, a delivery confirmation, a reference image) via **+ Add photo**,
  which opens the phone's camera/photo picker on mobile or a normal file
  picker on desktop. Photos show as a small thumbnail grid; tap one to view
  it full-size, and delete your own uploads anytime (the admin can delete
  any photo). Live for everyone viewing that task at the same time — no
  refresh needed.
- **Notes** — a lightweight back-and-forth note thread on the task, for
  quick context that doesn't belong in the task's main instructions
  ("left the extra hardware in the top drawer," "customer wants it a shade
  darker," etc.). Anyone who can see the task can post a note; you can
  delete your own notes, and the admin can delete any note. Also live via
  Realtime.

Photos are stored in a Supabase Storage bucket (`task-photos`) that's
**public** by URL — meaning anyone with the exact photo link (a long,
unguessable random address, similar to a "anyone with the link" Google
Drive share) can view that one photo without logging in, even though the
app itself never exposes that link anywhere outside the task it belongs
to. This tradeoff was chosen deliberately to keep photo viewing simple and
fast (a plain `<img>` tag, no extra sign-in-protected link-generation
step) — if that's ever a concern for a particularly sensitive photo, don't
attach it here.

## Notifications page

Every user (admin or employee) has a **Notifications** page in the nav with
two independent sections:

- **Push notifications** — a per-device toggle. Once enabled, this browser
  gets a real OS-level notification when a task is assigned to you, coming
  due within the next 2 hours (matching the same due-soon window used for
  in-app flashing), or overdue — even when the app isn't open. Requires the
  one-time setup in "Setting up push notifications" above; until that's
  done, this section just explains that push isn't configured yet rather
  than showing a broken toggle.
- **Calendar sync** — a personal, private link for subscribing to your
  tasks and all shared appointments/deliveries from Apple Calendar, Google
  Calendar, or Outlook (instructions for each are right there on the page).
  It's read-only and refreshes every hour or so on the calendar app's own
  schedule — completing a task in your calendar app doesn't mark it
  complete here. The link can be regenerated anytime, e.g. if you ever
  shared it somewhere you shouldn't have; the old one stops working the
  moment you do.

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
- `task_comments` and `task_photos` share a `can_access_task()` helper
  (same pattern as `is_admin()`) that returns true for an admin or for the
  task's own assignee — both tables' `SELECT`/`INSERT` policies are built
  on it, so a note or photo is only ever visible to the two people who can
  already see the task itself, never a coworker. Deleting a note is
  restricted to its author or an admin; deleting a photo (and its
  underlying Storage object) is restricted to its uploader or an admin.
  The `task-photos` Storage bucket's own policies re-derive the task id
  from the upload path (`<task_id>/<random>.<ext>`) and apply the exact
  same `can_access_task()` check, so Storage-level access matches the
  database-level access rather than being a separate, looser gate.
- `push_subscriptions` (Web Push registrations) has one `FOR ALL` policy
  scoped to `user_id = auth.uid()` — you can only ever see/add/remove your
  own device registrations, and there's deliberately no admin carve-out;
  the only thing that ever reads this table for sending is the
  `check-due-tasks` Edge Function's `service_role` key, which bypasses RLS
  entirely and isn't reachable from any client role. `task_push_log` (which
  prevents duplicate pushes) has RLS enabled with **zero** policies, which
  denies every client-side request by default — only that same Edge
  Function ever touches it.
- `profiles.feed_token` (the calendar-subscribe link) follows the same
  trust model as the `task-photos` Storage bucket above: not secret in the
  cryptographic sense, just an unguessable random value, readable only by
  its own owner or an admin (the existing `profiles_select` policy — no new
  policy needed), and only ever regenerable via the narrow
  `regenerate_my_feed_token()` function rather than a general self-update
  grant on `profiles` (employees still can't rename themselves or change
  their own role through it).

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
preserving completed ones as history, and that a note or photo posted on a
task is only ever visible/deletable to that task's assignee and the admin —
never a second employee, even via a direct API call.

## Test checklist

- [ ] Admin can log in and lands on the Calendar.
- [ ] `+ Add Task` creates "Move teak dresser", assigned to the employee, due
      tomorrow, urgency Urgent — and it appears on the calendar in red.
- [ ] Employee logs in, lands on **My Tasks**, and sees the task under
      "Today"/its day-of-week or "Tomorrow"/its future-week section (or
      "Overdue" once its deadline passes).
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
      and the browser tab title shows the count (e.g. "(2) Mid Haven Furniture").
      All three go away once every task has been opened.
- [ ] On **My Tasks**, a task due tomorrow appears under "Tomorrow", a task
      due later this week appears under its own weekday-named section (e.g.
      "Friday"), and a task due in the next 1–3 weeks appears under "Next
      week"/"In 2 weeks"/"In 3 weeks" with the correct date range in its
      heading — each a separate section, one per day for this week and one
      per week beyond it. A task due more than 3 weeks out doesn't appear on
      My Tasks at all.
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
      and it (or its ↻ icon) is visible right away on the calendar and in
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
- [ ] Opening a repeating task shows "↻ Repeats {frequency}" and a **Stop
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
- [ ] On a phone-width screen, the Calendar page opens showing the compact
      Apple Calendar-style month grid (not a squeezed FullCalendar grid),
      with small dots under days that have tasks/appointments, rather than
      event text crammed into cells.
- [ ] On that phone view, tapping a day fills its number with a blue circle
      and lists that day's tasks/appointments below the grid, sorted by
      time; tapping an item opens the same details view as everywhere else.
- [ ] Tapping **Week** switches to a single scrollable week row (same dots,
      same tap-to-select behavior); tapping **Month** switches back.
- [ ] The ‹ › arrows and swiping left/right on the grid move to the
      previous/next month or week; **Today** jumps back to today.
- [ ] Tapping the **+** next to the agenda date opens the same "Task or
      Appointment/Delivery?" chooser (or goes straight to whichever one you
      can create) as clicking a date on desktop.
- [ ] On a normal desktop-width browser window, the calendar's default view
      is unchanged from before (admin: month, employee: week, full
      FullCalendar grid).
- [ ] On a phone-width screen, navigation is a **☰** button in the top
      right (no bottom tab bar, no full sidebar); tapping it opens a
      dropdown with the same links the desktop sidebar has.
- [ ] Tapping a link in that menu navigates and closes the menu; tapping
      outside it or pressing Esc also closes it without navigating.
- [ ] As an employee with an unviewed task, a small dot shows on the ☰
      button itself (before opening the menu), and the numbered "New"
      badge shows next to My Tasks once the menu is open — both disappear
      once every task's been viewed.
- [ ] On a normal desktop-width browser window, the full sidebar still
      shows on the left as before, with no ☰ button visible anywhere.
- [ ] An open task with a due time starts flashing an amber ring (task card,
      calendar event, and phone agenda item alike) once it's within 2 hours
      of that time, with a matching amber "Due soon" pill; it stops
      flashing — and turns into the red "Overdue" styling instead — the
      moment the time passes.
- [ ] An open task with no due time (just a due date) flashes for its whole
      due date, not just the last couple of hours before midnight.
- [ ] A completed task never flashes, regardless of its due date/time.
- [ ] Leaving a task list or the calendar open without touching anything,
      a task starts flashing on its own once it crosses into its due-soon
      window (no click/refresh needed) — give it a minute or two after the
      threshold passes.
- [ ] The task details view shows a "Due soon" status (amber) instead of
      "Open" for a due-soon task, and "Overdue" once it's past due.
- [ ] With the OS "reduce motion" accessibility setting on, due-soon tasks
      show their amber styling but don't animate/flash.
- [ ] An appointment/delivery due soon flashes the same amber ring/pill on
      the calendar and in its details view, and stops flashing once its
      date/time has passed.
- [ ] Saving a task, template, calendar entry, or settings change shows a
      toast confirmation in the corner; so does completing, reopening, or
      deleting a task, and stopping a recurrence.
- [ ] Typing into the Add/Edit Task form, then clicking Close (or the
      overlay, or pressing Esc) prompts "Discard changes?"; closing an
      untouched form does not prompt.
- [ ] On a phone, opening **Add Task**/**Add my task**/**Add appointment or
      delivery**/**New preset** does not pop the on-screen keyboard — the
      Title field shows its placeholder text, unfocused, until you tap it.
- [ ] Clicking **Reset to defaults** on Settings prompts for confirmation
      before actually resetting the urgency colors.
- [ ] Opening a task and clicking **Duplicate** opens the Add Task form
      pre-filled with the same title/instructions/assignee/urgency but
      today's date; saving it creates a separate new task (the original is
      untouched).
- [ ] On the **Employees** page, clicking an employee's name opens the
      Tasks list filtered to them; clicking their Overdue/Open/Completed
      count opens it filtered to both that employee and that status.
- [ ] On the admin Tasks list, clicking **Select** shows checkboxes on each
      task card and a floating action bar; selecting a few tasks and
      clicking **Complete** marks them all complete, **Reassign** (after
      picking an employee) reassigns them all, and **Delete** (after
      confirming) removes them all. **Cancel** exits selection mode without
      changing anything.
- [ ] On a touch device, swiping a task card right reveals a green Complete
      action and swiping left reveals a red Delete action (with a confirm
      prompt); a task you don't have permission to complete/delete doesn't
      reveal that particular action. A plain tap still opens the task.
- [ ] Typing in the search box on **My Tasks** filters the task sections
      below to matching titles/descriptions, while the four summary tiles
      above it keep showing your full, unfiltered counts.
- [ ] Clicking a My Tasks summary tile (Overdue/Due today/This week/
      Completed) scrolls to that section.
- [ ] Opening any task's details shows **Photos** and **Notes** sections,
      visible to both the admin and the assigned employee (not just the
      admin). Adding a photo or posting a note from one side appears for
      the other side without a refresh (Realtime); each side can delete
      their own photos/notes, and the admin can delete anyone's.
- [ ] A second employee cannot see another employee's task notes/photos —
      confirm by checking that task's details as that second employee (or
      via a direct query) shows nothing.
- [ ] The app is titled "Mid Haven Furniture" everywhere — the browser tab,
      the sidebar/mobile top bar brand, the login page, and the home-screen
      icon name after "Add to Home Screen."
- [ ] Every pop-up shows a **×** in its top-right corner and a clearly
      bordered Close/Cancel button; clicking either, or clicking/tapping
      outside the pop-up, closes it.
- [ ] On a computer, hovering over a day in month view (or a day column in
      week/day view) highlights it; this has no effect on a touchscreen.
- [ ] Every dropdown (urgency, assignee, repeat, appointment/delivery type,
      employee filter, time picker) opens a custom-styled list on click —
      not your browser's plain system menu — with a checkmark next to the
      selected option.
- [ ] With a dropdown open, arrow keys move the highlight, Enter/Space picks
      the highlighted option, Escape closes it without changing anything
      and returns focus to the field, and typing a letter jumps to the next
      option starting with it.
- [ ] Clicking/tapping outside an open dropdown, or scrolling the page,
      closes it without changing the value.
- [ ] A dropdown near the bottom of a form opens upward instead of running
      off the bottom of the screen.
- [ ] Tapping a preset on the Templates page opens a view of it (urgency +
      full instructions) with Edit/Delete/Close, instead of jumping
      straight into editing.
- [ ] From that view, Edit opens the same preset form pre-filled; Delete
      asks for confirmation first.
- [ ] On a phone-width screen, the ☰ menu button is noticeably bigger/easier
      to tap than before.
- [ ] Tapping "Mid Haven Furniture" (top-left of the sidebar on desktop, or
      the mobile top bar) takes the admin to Tasks and an employee to My
      Tasks.
- [ ] The Theme dropdown (sidebar footer / mobile menu) switches instantly
      between Light and Dark, no reload needed; picking "Match system" then
      changing your OS/browser's own light/dark setting flips the app to
      match without a reload either.
- [ ] Reloading the app in Dark keeps it dark immediately — no flash of a
      light screen first.
- [ ] On the login page, "Forgot password?" switches to an email form;
      submitting it always shows the same "if an account exists..." message
      (whether or not that email is real), and a valid account receives an
      actual reset email.
- [ ] Clicking the emailed reset link lands on a "set a new password" page;
      saving a new password signs you into the app, and you can immediately
      log out and back in with the new password. Revisiting an
      already-used or expired reset link shows an "isn't valid" message
      instead of a form.
- [ ] Both roles see a **Notifications** page in the nav.
- [ ] On the Notifications page, the **Calendar sync** link opens/downloads
      a valid `.ics` file when visited directly; subscribing to it from a
      calendar app shows your open tasks and every appointment/delivery,
      refreshing on its own over time. Clicking **Regenerate link** changes
      the link and immediately invalidates the old one.
- [ ] With push notifications set up (step 15) and enabled on a device,
      assigning a task to that person, a task nearing its due time, and a
      task going overdue each produce exactly one notification — not one
      per scheduled check — and tapping a notification opens the app.
