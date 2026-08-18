import type { Task } from '../types';

/**
 * Date/time helpers.
 *
 * Important: `due_date` is stored as a plain Postgres `date` (no timezone —
 * e.g. "2026-08-19"). We always treat it as a calendar date in the viewer's
 * local timezone rather than parsing it as UTC midnight, which would shift
 * it to the previous day for anyone west of UTC. `due_time`, when present,
 * is a plain local time-of-day ("14:30:00") with no timezone attached — it
 * is combined with due_date and interpreted in the local browser timezone.
 *
 * All server-recorded timestamps (first_viewed_at, last_viewed_at,
 * completed_at, created_at, updated_at, task_events.created_at) ARE full
 * timezone-aware timestamps from Postgres `now()`, and are formatted here
 * using the browser's local timezone for display.
 */

/** Parse a "YYYY-MM-DD" string into a local Date at local midnight. */
export function parseLocalDate(dateStr: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, (month ?? 1) - 1, day ?? 1);
}

/** Today as "YYYY-MM-DD" in the local timezone. */
export function todayLocalISODate(): string {
  return toLocalISODate(new Date());
}

export function toLocalISODate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** A Date's local time-of-day as "HH:MM" (24-hour), for pre-filling a time field. */
export function toLocalHHMM(date: Date): string {
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

/**
 * The effective deadline for a task, as a local Date object.
 * If due_time is set, it's due_date + due_time (local).
 * If not, the task is considered due by the end of that local calendar day.
 */
export function taskDeadline(task: Pick<Task, 'due_date' | 'due_time'>): Date {
  const base = parseLocalDate(task.due_date);
  if (task.due_time) {
    const [h, m, s] = task.due_time.split(':').map(Number);
    base.setHours(h ?? 0, m ?? 0, s ?? 0, 0);
  } else {
    base.setHours(23, 59, 59, 999);
  }
  return base;
}

export function isTaskOverdue(task: Pick<Task, 'due_date' | 'due_time' | 'status'>): boolean {
  if (task.status === 'completed') return false;
  return taskDeadline(task).getTime() < Date.now();
}

export function isTaskDueToday(task: Pick<Task, 'due_date'>): boolean {
  return task.due_date === todayLocalISODate();
}

/** How far ahead of a timed deadline a task counts as "due soon" (see isTaskDueSoon). */
export const DUE_SOON_WINDOW_MS = 2 * 60 * 60 * 1000; // 2 hours

/**
 * True for an open (not completed, not yet overdue) task whose deadline is
 * imminent — used to flash it in task lists/the calendar as a heads-up
 * before it's actually late. A task with a specific due_time counts as due
 * soon once it's within DUE_SOON_WINDOW_MS of that time. An all-day task
 * (no due_time) has no specific time to measure hours against, so it counts
 * as due soon for its entire due date instead — otherwise it would only
 * start flashing a couple of hours before midnight, which isn't useful.
 * Stops being "due soon" the moment it's overdue instead — overdue already
 * has its own, stronger red styling, so the two never overlap.
 *
 * `now` defaults to the current time, but callers that re-render on a timer
 * (see useNow()) should pass their ticked value through — that's what
 * actually makes a task start flashing without requiring some unrelated
 * change to trigger a re-render first.
 */
export function isTaskDueSoon(
  task: Pick<Task, 'due_date' | 'due_time' | 'status'>,
  now: number = Date.now(),
): boolean {
  if (task.status === 'completed') return false;
  const deadline = taskDeadline(task).getTime();
  if (deadline <= now) return false;
  if (!task.due_time) return task.due_date === todayLocalISODate();
  return deadline - now <= DUE_SOON_WINDOW_MS;
}

/**
 * Same "due soon" idea as isTaskDueSoon, but for a calendar_events row
 * (an appointment/delivery) — event_date/event_time instead of
 * due_date/due_time, and no completed/overdue status to check first, since
 * calendar events don't track completion.
 */
export function isCalendarEventDueSoon(
  event: { event_date: string; event_time: string | null },
  now: number = Date.now(),
): boolean {
  const deadline = parseLocalDate(event.event_date);
  if (event.event_time) {
    const [h, m, s] = event.event_time.split(':').map(Number);
    deadline.setHours(h ?? 0, m ?? 0, s ?? 0, 0);
  } else {
    deadline.setHours(23, 59, 59, 999);
  }
  const deadlineMs = deadline.getTime();
  if (deadlineMs <= now) return false;
  if (!event.event_time) return event.event_date === todayLocalISODate();
  return deadlineMs - now <= DUE_SOON_WINDOW_MS;
}

/**
 * True if `dateStr` falls within the current local calendar week
 * (Sunday-Saturday, matching the calendar's firstDay=0), including today.
 * Used to split "upcoming" tasks into "this week" vs. "future" groups.
 */
export function isWithinCurrentWeek(dateStr: string): boolean {
  const date = parseLocalDate(dateStr);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const startOfWeek = new Date(today);
  startOfWeek.setDate(today.getDate() - today.getDay());
  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(startOfWeek.getDate() + 6);
  endOfWeek.setHours(23, 59, 59, 999);
  return date.getTime() >= startOfWeek.getTime() && date.getTime() <= endOfWeek.getTime();
}

const dateFormatter = new Intl.DateTimeFormat(undefined, {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
});

const dateTimeFormatter = new Intl.DateTimeFormat(undefined, {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});

const timeFormatter = new Intl.DateTimeFormat(undefined, {
  hour: 'numeric',
  minute: '2-digit',
});

const shortDateFormatter = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
});

/** Format a "YYYY-MM-DD" due_date for display, e.g. "August 19, 2026". */
export function formatDueDate(dateStr: string): string {
  return dateFormatter.format(parseLocalDate(dateStr));
}

export function formatDueDateShort(dateStr: string): string {
  return shortDateFormatter.format(parseLocalDate(dateStr));
}

/** Format a "HH:MM:SS" due_time for display, e.g. "2:30 PM". */
export function formatDueTime(timeStr: string): string {
  const [h, m] = timeStr.split(':').map(Number);
  const d = new Date();
  d.setHours(h ?? 0, m ?? 0, 0, 0);
  return timeFormatter.format(d);
}

/** Format an ISO timestamptz string (server time) in the local timezone. */
export function formatTimestamp(isoString: string): string {
  return dateTimeFormatter.format(new Date(isoString));
}

export function formatRelativeToNow(isoString: string): string {
  const then = new Date(isoString).getTime();
  const diffMs = Date.now() - then;
  const diffMin = Math.round(diffMs / 60000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin} min ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr} hr ago`;
  const diffDay = Math.round(diffHr / 24);
  return `${diffDay} day${diffDay === 1 ? '' : 's'} ago`;
}
