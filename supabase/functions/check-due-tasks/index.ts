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

interface PushJob {
  taskId: string;
  userId: string;
  kind: 'assigned' | 'due_soon' | 'overdue';
  title: string;
}

const NOTIFICATION_COPY: Record<PushJob['kind'], (title: string) => { title: string; body: string }> = {
  assigned: (title) => ({ title: 'New task assigned', body: title }),
  due_soon: (title) => ({ title: 'Task due soon', body: title }),
  overdue: (title) => ({ title: 'Task overdue', body: title }),
};

Deno.serve(async (req) => {
  if (CRON_SECRET && req.headers.get('x-cron-secret') !== CRON_SECRET) {
    return new Response('Unauthorized', { status: 401 });
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const nowMs = Date.now();

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
    if (!sentSet.has(`${task.id}:assigned`)) {
      jobs.push({ taskId: task.id, userId: task.assigned_to, kind: 'assigned', title: task.title });
    }

    const overdue = taskDeadlineMs(task.due_date, task.due_time) < nowMs;
    if (overdue) {
      if (!sentSet.has(`${task.id}:overdue`)) {
        jobs.push({ taskId: task.id, userId: task.assigned_to, kind: 'overdue', title: task.title });
      }
    } else if (isDueSoon(task.due_date, task.due_time, nowMs) && !sentSet.has(`${task.id}:due_soon`)) {
      jobs.push({ taskId: task.id, userId: task.assigned_to, kind: 'due_soon', title: task.title });
    }
  }

  let sent = 0;
  let failed = 0;

  for (const job of jobs) {
    const { data: subs } = await admin
      .from('push_subscriptions')
      .select('id, endpoint, p256dh, auth')
      .eq('user_id', job.userId);

    const payload = JSON.stringify({ ...NOTIFICATION_COPY[job.kind](job.title), taskId: job.taskId, url: '/' });

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

    // Mark this (task, kind) as handled regardless of whether there was a
    // subscription to deliver to, so it's never retried — if they enable
    // push later, the *next* task/deadline will still reach them normally.
    await admin.from('task_push_log').upsert({ task_id: job.taskId, kind: job.kind });
  }

  return new Response(JSON.stringify({ checked: (tasks ?? []).length, notified: jobs.length, sent, failed }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
