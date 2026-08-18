import JSZip from 'jszip';
import {
  fetchAllTaskComments,
  fetchAllTaskEvents,
  fetchAllTaskPhotos,
  fetchAllTaskRecurrences,
  fetchCalendarEvents,
  fetchProfiles,
  fetchTasks,
  fetchTaskTemplates,
  fetchUrgencySettings,
  taskPhotoUrl,
} from './api';
import { formatDueDate, formatDueTime, formatTimestamp } from './dates';
import { URGENCY_META } from './urgency';
import type {
  CalendarEvent,
  Profile,
  Task,
  TaskComment,
  TaskEvent,
  TaskPhoto,
  TaskRecurrence,
  TaskTemplate,
  UrgencySetting,
} from '../types';

const FORMAT_VERSION = 1;

interface BackupJson {
  meta: {
    app: string;
    generated_at: string;
    generated_by: { id: string; name: string; email: string | null };
    format_version: number;
    restore_instructions: string;
    intentionally_excluded: string[];
  };
  profiles: Profile[];
  tasks: Task[];
  task_events: TaskEvent[];
  task_comments: TaskComment[];
  task_photos: (TaskPhoto & { public_url: string })[];
  task_templates: TaskTemplate[];
  task_recurrences: TaskRecurrence[];
  urgency_settings: UrgencySetting[];
  calendar_events: CalendarEvent[];
}

/**
 * Pulls every row from every table this app owns (RLS already limits this
 * to "everything" for an admin — see the fetchAll* comment in lib/api.ts)
 * and shapes it into one JSON-serializable object: complete enough that
 * Claude (or anyone comfortable with SQL) can reconstruct the whole
 * database from it if the Supabase project ever loses its data, but also
 * plain enough to read directly if you just want to see what's in it.
 */
export async function buildBackupData(admin: Profile): Promise<BackupJson> {
  const [profiles, tasksWithProfiles, taskEvents, taskComments, taskPhotos, templates, recurrences, urgency, events] =
    await Promise.all([
      fetchProfiles(),
      fetchTasks(),
      fetchAllTaskEvents(),
      fetchAllTaskComments(),
      fetchAllTaskPhotos(),
      fetchTaskTemplates(),
      fetchAllTaskRecurrences(),
      fetchUrgencySettings(),
      fetchCalendarEvents(),
    ]);

  // Strip the nested assignee/creator/recurrence objects fetchTasks() joins
  // in for the UI — they're just profiles/task_recurrences rows already
  // present elsewhere in this same backup, so keeping them here too would
  // just be duplicated data with more room to drift/confuse a restore.
  const tasks: Task[] = tasksWithProfiles.map(({ assignee: _assignee, creator: _creator, recurrence: _recurrence, ...task }) => task);
  const calendarEvents: CalendarEvent[] = events.map(({ creator: _creator, ...event }) => event);

  return {
    meta: {
      app: 'Mid Haven Furniture',
      generated_at: new Date().toISOString(),
      generated_by: { id: admin.id, name: admin.full_name, email: admin.email },
      format_version: FORMAT_VERSION,
      restore_instructions:
        'To rebuild the database from this file: 1) In a fresh (or emptied) Supabase project, run the current ' +
        'supabase/schema.sql. 2) For each row in profiles below, insert a matching row into auth.users FIRST, ' +
        'reusing the exact same id (the auth.users row can use a throwaway/must-be-reset password — real ' +
        'passwords are never included in this backup and cannot be recovered). 3) Insert the rows from ' +
        'profiles, task_templates, task_recurrences, tasks, task_events, task_comments, task_photos, ' +
        'urgency_settings, and calendar_events, in that order (it matches their foreign-key dependencies), ' +
        'preserving every id/created_at/timestamp exactly as given. 4) task_photos rows reference photo files ' +
        'that are NOT included in this backup (see intentionally_excluded) — the metadata restores, but a ' +
        "photo's actual image will show broken until/unless that file is re-uploaded to the task-photos " +
        'Storage bucket at the same storage_path. Hand this whole file to Claude and ask it to write the ' +
        'restore migration — the structure here is meant to make that mechanical, not something you need to ' +
        'do by hand.',
      intentionally_excluded: [
        'Login passwords — Supabase never exposes these to anyone, including this export.',
        'Photo image files themselves (task_photos below has the metadata and a link to each one, not the image bytes).',
        'Push notification device registrations (push_subscriptions) — device-specific and re-created automatically next time each person enables notifications.',
        'Calendar-sync feed tokens (profiles.feed_token) — security-sensitive; a new one is generated automatically the first time each person opens their Notifications page after a restore.',
      ],
    },
    profiles,
    tasks,
    task_events: taskEvents,
    task_comments: taskComments,
    task_photos: taskPhotos.map((p) => ({ ...p, public_url: taskPhotoUrl(p.storage_path) })),
    task_templates: templates,
    task_recurrences: recurrences,
    urgency_settings: urgency,
    calendar_events: calendarEvents,
  };
}

function profileName(profiles: Profile[], id: string): string {
  return profiles.find((p) => p.id === id)?.full_name ?? 'Unknown';
}

/** Human-readable Markdown rendering of the same backup — for reading, not restoring. */
export function buildReadableSummary(data: BackupJson): string {
  const { profiles, tasks, task_templates, urgency_settings, calendar_events, task_recurrences } = data;
  const lines: string[] = [];

  lines.push('# Mid Haven Furniture — Data Backup');
  lines.push('');
  lines.push(`Generated ${formatTimestamp(data.meta.generated_at)} by ${data.meta.generated_by.name}.`);
  lines.push('');
  lines.push(
    'This is a plain-text summary of everything in the app at the moment this backup was taken, meant to be ' +
      'readable on its own, offline, without any special software. The companion `backup.json` file in this ' +
      'same zip has the complete, exact data (including internal ids/relationships) — if the server ever loses ' +
      "its data, give **both files** to Claude and ask it to rebuild the database; that file has step-by-step " +
      'restore instructions built in.',
  );
  lines.push('');
  lines.push('**Not included in this backup:**');
  for (const item of data.meta.intentionally_excluded) {
    lines.push(`- ${item}`);
  }
  lines.push('');
  lines.push('---');
  lines.push('');

  lines.push(`## People (${profiles.length})`);
  lines.push('');
  for (const p of profiles) {
    lines.push(`- **${p.full_name}** (${p.role}) — ${p.email ?? 'no email on file'}`);
  }
  lines.push('');

  const open = tasks.filter((t) => t.status === 'open');
  const completed = tasks.filter((t) => t.status === 'completed');
  lines.push(`## Tasks (${tasks.length} total — ${open.length} open, ${completed.length} completed)`);
  lines.push('');

  const byAssignee = new Map<string, Task[]>();
  for (const t of tasks) {
    const list = byAssignee.get(t.assigned_to) ?? [];
    list.push(t);
    byAssignee.set(t.assigned_to, list);
  }

  for (const [assigneeId, list] of byAssignee) {
    lines.push(`### ${profileName(profiles, assigneeId)}`);
    lines.push('');
    const sorted = [...list].sort((a, b) => a.due_date.localeCompare(b.due_date));
    for (const t of sorted) {
      const box = t.status === 'completed' ? '[x]' : '[ ]';
      const due = `${formatDueDate(t.due_date)}${t.due_time ? ` at ${formatDueTime(t.due_time)}` : ''}`;
      const urgencyLabel = URGENCY_META[t.urgency]?.label ?? t.urgency;
      const statusNote = t.status === 'completed' && t.completed_at ? ` — completed ${formatTimestamp(t.completed_at)}` : '';
      lines.push(`- ${box} **${t.title}** — due ${due} — ${urgencyLabel}${statusNote}`);
      if (t.description) {
        lines.push(`  ${t.description.replace(/\n/g, '\n  ')}`);
      }
    }
    lines.push('');
  }

  lines.push(`## Appointments & Deliveries (${calendar_events.length})`);
  lines.push('');
  const sortedEvents = [...calendar_events].sort((a, b) => a.event_date.localeCompare(b.event_date));
  for (const e of sortedEvents) {
    const when = `${formatDueDate(e.event_date)}${e.event_time ? ` at ${formatDueTime(e.event_time)}` : ''}`;
    const kind = e.event_type === 'delivery' ? 'Delivery' : 'Appointment';
    lines.push(`- ${when} — ${kind}: **${e.title}** — added by ${profileName(profiles, e.created_by)}`);
  }
  lines.push('');

  lines.push(`## Task Presets (${task_templates.length})`);
  lines.push('');
  for (const preset of task_templates) {
    const urgencyLabel = URGENCY_META[preset.urgency]?.label ?? preset.urgency;
    lines.push(`- **${preset.title}** — ${urgencyLabel}`);
  }
  lines.push('');

  const activeRecurrences = task_recurrences.filter((r) => r.active);
  if (task_recurrences.length > 0) {
    lines.push(`## Recurring Task Series (${activeRecurrences.length} active, ${task_recurrences.length} total)`);
    lines.push('');
    for (const r of task_recurrences) {
      lines.push(
        `- ${r.active ? 'Active' : 'Stopped'}: **${r.title}** (${r.frequency}, assigned to ${profileName(profiles, r.assigned_to)}, started ${formatDueDate(r.start_date)})`,
      );
    }
    lines.push('');
  }

  lines.push('## Urgency Colors');
  lines.push('');
  for (const u of urgency_settings) {
    lines.push(`- ${URGENCY_META[u.urgency]?.label ?? u.urgency}: \`${u.color}\``);
  }
  lines.push('');

  return lines.join('\n');
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Fetches everything, zips a machine-readable JSON + a human-readable Markdown summary together, and downloads it. */
export async function downloadBackup(admin: Profile): Promise<void> {
  const data = await buildBackupData(admin);
  const summary = buildReadableSummary(data);

  const zip = new JSZip();
  zip.file('backup.json', JSON.stringify(data, null, 2));
  zip.file('README.md', summary);

  const blob = await zip.generateAsync({ type: 'blob' });
  const dateStr = new Date().toISOString().slice(0, 10);
  downloadBlob(blob, `mid-haven-furniture-backup-${dateStr}.zip`);
}
