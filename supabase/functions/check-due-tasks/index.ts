// Scheduled Web Push sender — invoked on a timer by pg_cron (see README
// "Setting up push notifications"), not by the frontend. Each run scans
// every open task once and sends at most one push per (task, kind):
//   - "assigned"  the first time this function has ever seen the task
//   - "due_soon"  once its deadline is within the same 2-hour window the
//                 in-app UI already uses to flash it (see DUE_SOON_WINDOW_MS
//                 in src/lib/dates.ts — kept in sync with the value here)
//   - "overdue"   once, right after its deadline passes
// task_push_log (schema.sql section 22) is what makes each of those
// "exactly once" rather than "every 5 minutes forever".
//
// It also notifies every admin (schema.sql section 23) when an employee —
// not an admin — completes a task, adds their own task, views a task for
// the very first time, edits their own task, or deletes their own task.
// This direction only: an admin editing or deleting a task never notifies
// the employee it's assigned to. "admin_overdue" reuses task_push_log the
// same way as above; everything else keyed off a task_events row
// (completed/added/first-viewed/edited) is de-duped via admin_push_log,
// since those can legitimately happen more than once for the same task
// over its lifetime. Deletions have no task_events row left to key off
// (task_events cascades away with the task), so those come from
// task_deletion_log (schema.sql section 24) instead, with its own
// `notified` flag doing the de-dupe.
//
// Deploy: supabase functions deploy check-due-tasks --no-verify-jwt
// (pg_cron can't send an Authorization header either — see CRON_SECRET
// below for the actual guard against random invocations.)

import { createClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY')!;
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY')!;
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:admin@example.com';
// Single shop-wide timezone used to interpret due_date/due_time server-side
// — an IANA name like "America/Chicago". The rest of the app deliberately
// has no server-side timezone concept (every due date is just "local to
// whoever's looking at it" — see the comment block atop src/lib/dates.ts),
// but a scheduled job has no "whoever's looking" to borrow a timezone from,
// so it needs one explicit value. Set via `supabase secrets set
// BUSINESS_TIMEZONE=...`; defaults to US Eastern if unset.
const BUSINESS_TIMEZONE = Deno.env.get('BUSINESS_TIMEZONE') ?? 'America/New_York';
// Optional shared secret so a stranger who discovers this function's URL
// can't trigger real push notifications to real employees. Set the same
// value here (`supabase secrets set CRON_SECRET=...`) and in the
// x-cron-secret header of the pg_cron job that calls this function.
const CRON_SECRET = Deno.env.get('CRON_SECRET');

// Matches DUE_SOON_WINDOW_MS in src/lib/dates.ts.
const DUE_SOON_WINDOW_MS = 2 * 60 * 60 * 1000;

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

/**
 * The UTC instant (in ms) that a given wall-clock date/time represents in
 * `timeZone` — e.g. (2026, 8, 19, 17, 0, 0, "America/Chicago") -> the UTC
 * timestamp for 5pm Chicago time on Aug 19, 2026, correctly accounting for
 * DST at that specific date. Standard double-pass technique: guess, see how
 * that guess renders in the target zone, correct by the difference.
 */
function zonedTimeToUtcMs(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
  timeZone: string,
): number {
  const guessMs = Date.UTC(year, month - 1, day, hour, minute, second);
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  const parts = Object.fromEntries(dtf.formatToParts(new Date(guessMs)).map((p) => [p.type, p.value]));
  const asIfUtcMs = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  return guessMs + (guessMs - asIfUtcMs);
}

function taskDeadlineMs(dueDate: string, dueTime: string | null): number {
  const [y, mo, d] = dueDate.split('-').map(Number);
  if (dueTime) {
    const [h, mi, s] = dueTime.split(':').map(Number);
    return zonedTimeToUtcMs(y, mo, d, h, mi, s || 0, BUSINESS_TIMEZONE);
  }
  // All-day task: due by the end of that calendar day, same as taskDeadline() in src/lib/dates.ts.
  return zonedTimeToUtcMs(y, mo, d, 23, 59, 59, BUSINESS_TIMEZONE);
}

function todayInBusinessTz(nowMs: number): string {
  // en-CA formats as YYYY-MM-DD, matching due_date's format directly.
  return new Intl.DateTimeFormat('en-CA', { timeZone: BUSINESS_TIMEZONE }).format(new Date(nowMs));
}

function isDueSoon(dueDate: string, dueTime: string | null, nowMs: number): boolean {
  const deadline = taskDeadlineMs(dueDate, dueTime);
  if (deadline <= nowMs) return false;
  if (!dueTime) return dueDate === todayInBusinessTz(nowMs);
  return deadline - nowMs <= DUE_SOON_WINDOW_MS;
}

type PushKind =
  | 'assigned'
  | 'due_soon'
  | 'overdue'
  | 'admin_overdue'
  | 'admin_completed'
  | 'admin_added'
  | 'admin_first_viewed'
  | 'admin_task_edited'
  | 'admin_task_deleted';

interface PushJob {
  taskId: string;
  userId: string;
  kind: PushKind;
  title: string;
  body: string;
  // Set for the admin_task_edited kind above (plural since one edit can
  // fire several task_events rows at once — see the grouping below) —
  // de-duped per task_events row (admin_push_log) instead of per
  // (task_id, kind) like assigned/due_soon/overdue/admin_overdue.
  taskEventIds?: string[];
  // Set for admin_task_deleted — de-dupe already handled by flipping
  // task_deletion_log.notified before these jobs are even built, so the
  // send loop below should skip its own dedupe-write for these.
  dedupHandledExternally?: boolean;
}

Deno.serve(async (req) => {
  if (CRON_SECRET && req.headers.get('x-cron-secret') !== CRON_SECRET) {
    return new Response('Unauthorized', { status: 401 });
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const nowMs = Date.now();

  const { data: profiles, error: profilesError } = await admin.from('profiles').select('id, full_name, role');
  if (profilesError) {
    return new Response(JSON.stringify({ error: profilesError.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  const profileById = new Map((profiles ?? []).map((p) => [p.id, p]));
  const adminIds = (profiles ?? []).filter((p) => p.role === 'admin').map((p) => p.id);

  const { data: tasks, error: tasksError } = await admin
    .from('tasks')
    .select('id, title, due_date, due_time, assigned_to')
    .eq('status', 'open');

  if (tasksError) {
    return new Response(JSON.stringify({ error: tasksError.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const { data: alreadySent, error: logError } = await admin.from('task_push_log').select('task_id, kind');
  if (logError) {
    return new Response(JSON.stringify({ error: logError.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  const sentSet = new Set((alreadySent ?? []).map((r) => `${r.task_id}:${r.kind}`));

  const jobs: PushJob[] = [];
  for (const task of tasks ?? []) {
    const assignee = profileById.get(task.assigned_to);

    if (!sentSet.has(`${task.id}:assigned`)) {
      jobs.push({
        taskId: task.id,
        userId: task.assigned_to,
        kind: 'assigned',
        title: 'New task assigned',
        body: task.title,
      });
    }

    const overdue = taskDeadlineMs(task.due_date, task.due_time) < nowMs;
    if (overdue) {
      if (!sentSet.has(`${task.id}:overdue`)) {
        jobs.push({
          taskId: task.id,
          userId: task.assigned_to,
          kind: 'overdue',
          title: 'Task overdue',
          body: task.title,
        });
      }
      // Also loop in every admin — unless the assignee already IS an
      // admin, who'd otherwise get two pushes for their own task.
      if (assignee?.role === 'employee' && !sentSet.has(`${task.id}:admin_overdue`)) {
        for (const adminId of adminIds) {
          jobs.push({
            taskId: task.id,
            userId: adminId,
            kind: 'admin_overdue',
            title: 'Task overdue',
            body: `"${task.title}" (${assignee.full_name}) is overdue`,
          });
        }
      }
    } else if (isDueSoon(task.due_date, task.due_time, nowMs) && !sentSet.has(`${task.id}:due_soon`)) {
      jobs.push({
        taskId: task.id,
        userId: task.assigned_to,
        kind: 'due_soon',
        title: 'Task due soon',
        body: task.title,
      });
    }
  }

  // --- Admin notifications: an employee completed or added a task ---
  // Bounded to the last 24h so this stays cheap indefinitely (task_events
  // grows forever) — anything older would already be logged from an
  // earlier run anyway, so this window only matters after real downtime.
  if (adminIds.length > 0) {
    const windowStartIso = new Date(nowMs - 24 * 60 * 60 * 1000).toISOString();

    const EDIT_EVENT_TYPES = new Set(['edited', 'due_date_changed', 'urgency_changed']);

    const { data: recentEvents, error: eventsError } = await admin
      .from('task_events')
      .select('id, task_id, user_id, event_type, created_at')
      .in('event_type', ['completed', 'created', 'viewed', 'edited', 'due_date_changed', 'urgency_changed'])
      .gte('created_at', windowStartIso);
    if (eventsError) {
      return new Response(JSON.stringify({ error: eventsError.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const { data: alreadyAdminSent, error: adminLogError } = await admin
      .from('admin_push_log')
      .select('task_event_id');
    if (adminLogError) {
      return new Response(JSON.stringify({ error: adminLogError.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    const adminSentSet = new Set((alreadyAdminSent ?? []).map((r) => r.task_event_id));

    const relevantTaskIds = [...new Set((recentEvents ?? []).map((e) => e.task_id))];
    const { data: relatedTasks, error: relatedTasksError } =
      relevantTaskIds.length > 0
        ? await admin
            .from('tasks')
            .select('id, title, assigned_to, created_by, first_viewed_at')
            .in('id', relevantTaskIds)
        : { data: [], error: null };
    if (relatedTasksError) {
      return new Response(JSON.stringify({ error: relatedTasksError.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    const taskById = new Map((relatedTasks ?? []).map((t) => [t.id, t]));

    for (const event of recentEvents ?? []) {
      if (EDIT_EVENT_TYPES.has(event.event_type)) continue; // handled separately below — needs grouping
      if (adminSentSet.has(event.id)) continue;
      const task = taskById.get(event.task_id);
      const actor = event.user_id ? profileById.get(event.user_id) : undefined;
      // Only employee-performed actions are notification-worthy here — an
      // admin completing/adding a task is something they already know
      // about, since they just did it themselves.
      if (!task || !actor || actor.role !== 'employee') continue;

      if (event.event_type === 'completed') {
        for (const adminId of adminIds) {
          jobs.push({
            taskId: task.id,
            userId: adminId,
            kind: 'admin_completed',
            title: 'Task completed',
            body: `${actor.full_name} completed "${task.title}"`,
            taskEventIds: [event.id],
          });
        }
      } else if (event.event_type === 'created' && task.created_by === task.assigned_to) {
        // Self-added task (created_by === assigned_to). An admin assigning
        // a task to someone else also logs a 'created' event, but the
        // actor.role check above already excludes that case.
        for (const adminId of adminIds) {
          jobs.push({
            taskId: task.id,
            userId: adminId,
            kind: 'admin_added',
            title: 'New task added',
            body: `${actor.full_name} added "${task.title}"`,
            taskEventIds: [event.id],
          });
        }
      } else if (event.event_type === 'viewed' && task.first_viewed_at === event.created_at) {
        // mark_task_viewed() logs a 'viewed' event on every open, not just
        // the first — but it only ever sets first_viewed_at the first time
        // (via coalesce), in the same transaction as that first event row.
        // Postgres's now() is constant within one transaction, so an exact
        // match here means this is precisely the task's very first view,
        // not a repeat one.
        for (const adminId of adminIds) {
          jobs.push({
            taskId: task.id,
            userId: adminId,
            kind: 'admin_first_viewed',
            title: 'Task viewed',
            body: `${actor.full_name} viewed "${task.title}" for the first time`,
            taskEventIds: [event.id],
          });
        }
      }
    }

    // --- Edits: group same-transaction event rows into one notification ---
    // A single edit (e.g. changing both title and due date at once) fires
    // more than one task_events row with the exact same created_at — group
    // by (task_id, created_at) so that becomes one push, not several.
    const editGroups = new Map<string, { taskId: string; actorId: string | null; eventIds: string[] }>();
    for (const event of recentEvents ?? []) {
      if (!EDIT_EVENT_TYPES.has(event.event_type)) continue;
      const key = `${event.task_id}|${event.created_at}`;
      const group = editGroups.get(key);
      if (group) {
        group.eventIds.push(event.id);
      } else {
        editGroups.set(key, { taskId: event.task_id, actorId: event.user_id, eventIds: [event.id] });
      }
    }

    for (const group of editGroups.values()) {
      if (!group.eventIds.some((id) => !adminSentSet.has(id))) continue; // whole group already handled
      const task = taskById.get(group.taskId);
      const actor = group.actorId ? profileById.get(group.actorId) : undefined;
      if (!task || !actor) continue;

      // Only employee-performed edits are notification-worthy here — an
      // admin editing a task (their own or one they assigned) doesn't
      // notify anyone, same as completing/adding above. This is also the
      // only kind of task an employee can directly edit at all (their own
      // self-added task), so no further ownership check is needed.
      if (actor.role !== 'employee') continue;
      for (const adminId of adminIds) {
        jobs.push({
          taskId: task.id,
          userId: adminId,
          kind: 'admin_task_edited',
          title: 'Task edited',
          body: `${actor.full_name} edited "${task.title}"`,
          taskEventIds: group.eventIds,
        });
      }
    }
  }

  // --- Deletions: task_events (and first_viewed_at etc.) are gone the
  // instant a task is deleted, so these come from task_deletion_log
  // instead, with its own `notified` flag doing the de-dupe. Flipped to
  // true right here (not deferred to the send loop below) since a deleted
  // task_id can't be written back into task_push_log's FK-checked table.
  const { data: deletions, error: deletionsError } = await admin
    .from('task_deletion_log')
    .select('id, task_id, title, deleted_by')
    .eq('notified', false);
  if (deletionsError) {
    return new Response(JSON.stringify({ error: deletionsError.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  for (const deletion of deletions ?? []) {
    const actor = deletion.deleted_by ? profileById.get(deletion.deleted_by) : undefined;

    // Only employee-performed deletions are notification-worthy here — an
    // admin deleting a task (their own or one they assigned) doesn't
    // notify anyone, same as completing/adding/editing above. This is also
    // the only kind of task an employee can directly delete at all (their
    // own self-added task), so no further ownership check is needed.
    if (actor?.role === 'employee') {
      for (const adminId of adminIds) {
        jobs.push({
          taskId: deletion.task_id,
          userId: adminId,
          kind: 'admin_task_deleted',
          title: 'Task deleted',
          body: `${actor.full_name} deleted "${deletion.title}"`,
          dedupHandledExternally: true,
        });
      }
    }

    await admin.from('task_deletion_log').update({ notified: true }).eq('id', deletion.id);
  }

  let sent = 0;
  let failed = 0;

  for (const job of jobs) {
    const { data: subs } = await admin
      .from('push_subscriptions')
      .select('id, endpoint, p256dh, auth')
      .eq('user_id', job.userId);

    const payload = JSON.stringify({ title: job.title, body: job.body, taskId: job.taskId, url: '/' });

    for (const sub of subs ?? []) {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload,
        );
        sent++;
      } catch (err) {
        failed++;
        const statusCode = (err as { statusCode?: number }).statusCode;
        if (statusCode === 404 || statusCode === 410) {
          // The subscription no longer exists on the browser's end (data
          // cleared, extension/app uninstalled, etc.) — stop trying it.
          await admin.from('push_subscriptions').delete().eq('id', sub.id);
        }
      }
    }

    // Mark this as handled regardless of whether there was a subscription
    // to deliver to, so it's never retried.
    if (job.dedupHandledExternally) {
      // Deletion jobs — task_deletion_log.notified was already flipped
      // above, before these jobs were even built.
    } else if (job.taskEventIds) {
      for (const id of job.taskEventIds) {
        await admin.from('admin_push_log').upsert({ task_event_id: id });
      }
    } else {
      await admin.from('task_push_log').upsert({ task_id: job.taskId, kind: job.kind });
    }
  }

  return new Response(JSON.stringify({ checked: (tasks ?? []).length, notified: jobs.length, sent, failed }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
