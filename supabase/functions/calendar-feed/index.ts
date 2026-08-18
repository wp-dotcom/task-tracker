// Public, read-only iCalendar (.ics) feed for one user's tasks/appointments —
// deployed with --no-verify-jwt (see README "Calendar sync") since calendar
// apps subscribing by URL can't send an Authorization header. Identity comes
// from the unguessable `token` query param instead (profiles.feed_token),
// the same trust model as the task-photos Storage bucket in schema.sql.
//
// Deploy: supabase functions deploy calendar-feed --no-verify-jwt

import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

function icsEscape(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');
}

// RFC 5545 lines should be folded at 75 octets. This is a char-based
// approximation (fine for this app's plain-ASCII titles/descriptions).
function foldLine(line: string): string {
  if (line.length <= 75) return line;
  let result = line.slice(0, 75);
  let rest = line.slice(75);
  while (rest.length > 0) {
    result += '\r\n ' + rest.slice(0, 74);
    rest = rest.slice(74);
  }
  return result;
}

// "YYYY-MM-DD" (+ optional "HH:MM:SS") -> ICS floating-time string, with no
// trailing "Z" and no TZID. Floating time means "whatever time the
// calendar app's own timezone says" — exactly matching how this app already
// treats due_date/due_time as a local wall-clock date/time, not a fixed
// instant (see the big comment block at the top of src/lib/dates.ts).
function toICSDateTime(dateStr: string, timeStr: string | null): string {
  const datePart = dateStr.replace(/-/g, '');
  if (!timeStr) return datePart;
  const timePart = timeStr.replace(/:/g, '').slice(0, 6).padEnd(6, '0');
  return `${datePart}T${timePart}`;
}

// Adds exactly one hour to a "YYYYMMDDTHHMMSS" floating-time string, as
// pure calendar arithmetic (Date.UTC is just borrowed as a calendar
// calculator here — it has no real timezone meaning for a floating value).
function addOneHour(icsDateTime: string): string {
  const y = Number(icsDateTime.slice(0, 4));
  const mo = Number(icsDateTime.slice(4, 6)) - 1;
  const d = Number(icsDateTime.slice(6, 8));
  const h = Number(icsDateTime.slice(9, 11));
  const mi = Number(icsDateTime.slice(11, 13));
  const s = Number(icsDateTime.slice(13, 15));
  const dt = new Date(Date.UTC(y, mo, d, h + 1, mi, s));
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${dt.getUTCFullYear()}${pad(dt.getUTCMonth() + 1)}${pad(dt.getUTCDate())}` +
    `T${pad(dt.getUTCHours())}${pad(dt.getUTCMinutes())}${pad(dt.getUTCSeconds())}`
  );
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const token = url.searchParams.get('token');
  if (!token) {
    return new Response('Missing token', { status: 400 });
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  const { data: profile } = await admin
    .from('profiles')
    .select('id, full_name, role')
    .eq('feed_token', token)
    .maybeSingle();

  if (!profile) {
    return new Response('Not found', { status: 404 });
  }

  let tasksQuery = admin
    .from('tasks')
    .select('id, title, description, due_date, due_time')
    .eq('status', 'open')
    .order('due_date', { ascending: true });
  if (profile.role !== 'admin') {
    tasksQuery = tasksQuery.eq('assigned_to', profile.id);
  }
  const { data: tasks } = await tasksQuery;

  // Appointments/deliveries are shared/visible to everyone in the app, so
  // every subscriber (admin or employee) gets the full list.
  const { data: events } = await admin
    .from('calendar_events')
    .select('id, title, description, event_type, event_date, event_time')
    .order('event_date', { ascending: true });

  const dtstamp = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Mid Haven Furniture//Task Tracker//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    foldLine(`X-WR-CALNAME:Mid Haven Furniture — ${icsEscape(profile.full_name || 'My tasks')}`),
    // Hints most calendar apps honor for how often to re-fetch this URL.
    // Actual refresh timing is still up to each app — this is a request,
    // not a guarantee.
    'X-PUBLISHED-TTL:PT1H',
    'REFRESH-INTERVAL;VALUE=DURATION:PT1H',
  ];

  for (const task of tasks ?? []) {
    const isAllDay = !task.due_time;
    const start = toICSDateTime(task.due_date, task.due_time);
    lines.push('BEGIN:VEVENT');
    lines.push(`UID:task-${task.id}@midhavenfurniture`);
    lines.push(`DTSTAMP:${dtstamp}`);
    if (isAllDay) {
      lines.push(`DTSTART;VALUE=DATE:${start}`);
    } else {
      lines.push(`DTSTART:${start}`);
      lines.push(`DTEND:${addOneHour(start)}`);
    }
    lines.push(foldLine(`SUMMARY:${icsEscape(task.title)}`));
    if (task.description) {
      lines.push(foldLine(`DESCRIPTION:${icsEscape(task.description)}`));
    }
    lines.push('END:VEVENT');
  }

  for (const event of events ?? []) {
    const isAllDay = !event.event_time;
    const start = toICSDateTime(event.event_date, event.event_time);
    const kindLabel = event.event_type === 'delivery' ? 'Delivery' : 'Appointment';
    lines.push('BEGIN:VEVENT');
    lines.push(`UID:event-${event.id}@midhavenfurniture`);
    lines.push(`DTSTAMP:${dtstamp}`);
    if (isAllDay) {
      lines.push(`DTSTART;VALUE=DATE:${start}`);
    } else {
      lines.push(`DTSTART:${start}`);
      lines.push(`DTEND:${addOneHour(start)}`);
    }
    lines.push(foldLine(`SUMMARY:${icsEscape(`${kindLabel}: ${event.title}`)}`));
    if (event.description) {
      lines.push(foldLine(`DESCRIPTION:${icsEscape(event.description)}`));
    }
    lines.push('END:VEVENT');
  }

  lines.push('END:VCALENDAR');

  return new Response(lines.join('\r\n') + '\r\n', {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Cache-Control': 'no-cache',
    },
  });
});
