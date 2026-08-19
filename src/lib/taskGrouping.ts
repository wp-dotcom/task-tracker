import type { TaskWithProfiles } from '../types';
import { formatDueDateShort, formatWeekday, toLocalISODate, weekRange } from './dates';
import { urgencyWeight } from './urgency';

/**
 * The "Today / Tomorrow / Wednesday / ... / Next week / In 2 weeks / In 3
 * weeks" day-and-week grouping originally built for the employee My Tasks
 * page — pulled out here so the admin Tasks page can use the exact same
 * buckets rather than a second, drifting copy of this logic.
 */

export function byUrgencyThenDate(a: TaskWithProfiles, b: TaskWithProfiles): number {
  const w = urgencyWeight(a.urgency) - urgencyWeight(b.urgency);
  if (w !== 0) return w;
  return a.due_date.localeCompare(b.due_date);
}

export interface DayBucket {
  dateStr: string;
  label: string;
  tasks: TaskWithProfiles[];
}

export interface WeekBucket {
  key: string;
  label: string;
  tasks: TaskWithProfiles[];
}

const FUTURE_WEEK_LABELS = ['Next week', 'In 2 weeks', 'In 3 weeks'];

/** One section per remaining day of the current week (tomorrow through Saturday) — today has its own section above. */
export function buildDayBuckets(upcoming: TaskWithProfiles[]): DayBucket[] {
  const { end } = weekRange(0);
  const cursor = new Date();
  cursor.setHours(0, 0, 0, 0);
  cursor.setDate(cursor.getDate() + 1); // start from tomorrow
  const tomorrowStr = toLocalISODate(cursor);

  const days: DayBucket[] = [];
  while (cursor.getTime() <= end.getTime()) {
    const dateStr = toLocalISODate(cursor);
    days.push({
      dateStr,
      label: dateStr === tomorrowStr ? 'Tomorrow' : formatWeekday(dateStr),
      tasks: upcoming.filter((t) => t.due_date === dateStr).sort(byUrgencyThenDate),
    });
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}

/** One section per each of the next 3 full weeks after this one. */
export function buildFutureWeekBuckets(upcoming: TaskWithProfiles[]): WeekBucket[] {
  return [1, 2, 3].map((offset) => {
    const { start, end } = weekRange(offset);
    const startStr = toLocalISODate(start);
    const endStr = toLocalISODate(end);
    return {
      key: startStr,
      label: `${FUTURE_WEEK_LABELS[offset - 1]} (${formatDueDateShort(startStr)} – ${formatDueDateShort(endStr)})`,
      tasks: upcoming
        .filter((t) => t.due_date >= startStr && t.due_date <= endStr)
        .sort((a, b) => a.due_date.localeCompare(b.due_date) || byUrgencyThenDate(a, b)),
    };
  });
}
