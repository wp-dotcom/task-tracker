import type { TaskWithProfiles } from '../types';
import { todayLocalISODate, toLocalISODate, weekRange } from './dates';

/**
 * "How many tasks has each employee (and the team as a whole) completed" —
 * over a few fixed, glanceable windows, for the admin Dashboard. Computed
 * entirely client-side from the already-fetched tasks list (fetchTasks()
 * pulls every task the admin can see, completed or not, with no date
 * limit — see src/lib/api.ts), so this needs no new query or schema.
 *
 * "Today"/"this week" reuse the same completed_at.slice(0, 10) convention
 * already used by DashboardSummary and the My Tasks page's "Completed
 * today" stat — completed_at is a full UTC timestamp, and treating its
 * first 10 characters as a local calendar date is a small, deliberate
 * simplification (can be off by one near midnight) kept consistent with
 * those existing stats rather than introducing a second, more "correct"
 * but inconsistent convention here.
 */
export interface CompletionCounts {
  today: number;
  thisWeek: number;
  thisMonth: number;
  allTime: number;
}

function completionDateStr(task: TaskWithProfiles): string | null {
  return task.status === 'completed' && task.completed_at ? task.completed_at.slice(0, 10) : null;
}

export function computeCompletionCounts(tasks: TaskWithProfiles[]): CompletionCounts {
  const today = todayLocalISODate();
  const { start, end } = weekRange(0);
  const weekStartStr = toLocalISODate(start);
  const weekEndStr = toLocalISODate(end);
  const monthPrefix = today.slice(0, 7); // "YYYY-MM"

  const counts: CompletionCounts = { today: 0, thisWeek: 0, thisMonth: 0, allTime: 0 };
  for (const task of tasks) {
    const dateStr = completionDateStr(task);
    if (!dateStr) continue;
    counts.allTime += 1;
    if (dateStr === today) counts.today += 1;
    if (dateStr >= weekStartStr && dateStr <= weekEndStr) counts.thisWeek += 1;
    if (dateStr.startsWith(monthPrefix)) counts.thisMonth += 1;
  }
  return counts;
}

/** Same counts, broken out per employee (keyed by profile id). */
export function computeCompletionCountsByEmployee(
  tasks: TaskWithProfiles[],
  employeeIds: string[],
): Map<string, CompletionCounts> {
  const byEmployee = new Map<string, CompletionCounts>();
  for (const id of employeeIds) {
    byEmployee.set(id, computeCompletionCounts(tasks.filter((t) => t.assigned_to === id)));
  }
  return byEmployee;
}
