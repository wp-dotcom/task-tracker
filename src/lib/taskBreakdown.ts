import type { TaskWithProfiles } from '../types';
import { isTaskDueToday, isTaskOverdue, taskDeadline } from './dates';
import { computeCompletionCounts } from './completionStats';
import type { CompletionCounts } from './completionStats';

/** How many open/overdue/completed tasks a given set has, plus a couple of
 * short capped lists — the "click a Dashboard completion card" breakdown. */
export interface TaskBreakdown {
  completion: CompletionCounts;
  open: number;
  overdue: number;
  dueToday: number;
  /** Open tasks, soonest deadline first, capped so the modal stays short. */
  openTasks: TaskWithProfiles[];
  /** Completed tasks, most recently completed first, capped. */
  recentlyCompleted: TaskWithProfiles[];
}

const LIST_CAP = 6;

export function computeTaskBreakdown(tasks: TaskWithProfiles[]): TaskBreakdown {
  const openAll = tasks.filter((t) => t.status === 'open');
  const overdueAll = openAll.filter((t) => isTaskOverdue(t));
  const dueTodayAll = openAll.filter((t) => isTaskDueToday(t) && !isTaskOverdue(t));

  const openTasks = [...openAll]
    .sort((a, b) => taskDeadline(a).getTime() - taskDeadline(b).getTime())
    .slice(0, LIST_CAP);

  const recentlyCompleted = tasks
    .filter((t) => t.status === 'completed')
    .sort((a, b) => (b.completed_at ?? '').localeCompare(a.completed_at ?? ''))
    .slice(0, LIST_CAP);

  return {
    completion: computeCompletionCounts(tasks),
    open: openAll.length,
    overdue: overdueAll.length,
    dueToday: dueTodayAll.length,
    openTasks,
    recentlyCompleted,
  };
}
