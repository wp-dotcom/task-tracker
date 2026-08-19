/**
 * Preset "remind me before it's due" offsets, shown as a checklist when
 * creating/editing a task and on the task details view. Deliberately just a
 * curated preset list (not a free-text "enter any number of minutes" field)
 * to keep the picker a couple of taps, not a form of its own.
 */
export interface ReminderOffsetOption {
  minutes: number;
  label: string;
}

export const REMINDER_OFFSET_OPTIONS: ReminderOffsetOption[] = [
  { minutes: 15, label: '15 minutes before' },
  { minutes: 30, label: '30 minutes before' },
  { minutes: 60, label: '1 hour before' },
  { minutes: 120, label: '2 hours before' },
  { minutes: 240, label: '4 hours before' },
  { minutes: 1440, label: '1 day before' },
];

/**
 * "15 minutes" / "1 hour" / "1 day" — the same wording used in the preset
 * labels above, minus the "before" (used inline in the push notification
 * body: `"${title}" is due in ${formatReminderOffset(minutes)}`). Mirrored
 * server-side in supabase/functions/check-due-tasks/index.ts, which can't
 * import from src (separate Deno runtime) — keep both in sync by hand.
 */
export function formatReminderOffset(minutes: number): string {
  const preset = REMINDER_OFFSET_OPTIONS.find((o) => o.minutes === minutes);
  if (preset) return preset.label.replace(/ before$/, '');
  if (minutes % 1440 === 0) {
    const days = minutes / 1440;
    return `${days} day${days === 1 ? '' : 's'}`;
  }
  if (minutes % 60 === 0) {
    const hours = minutes / 60;
    return `${hours} hour${hours === 1 ? '' : 's'}`;
  }
  return `${minutes} minute${minutes === 1 ? '' : 's'}`;
}
