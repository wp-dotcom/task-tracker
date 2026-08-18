import type { TaskListFilter, TaskWithProfiles } from '../types';
import { isTaskDueToday, isTaskOverdue, taskDeadline, todayLocalISODate } from './dates';
import { urgencyWeight } from './urgency';

export function filterTasks(
  tasks: TaskWithProfiles[],
  opts: { filter: TaskListFilter; employeeId: string | 'all'; search: string },
): TaskWithProfiles[] {
  const search = opts.search.trim().toLowerCase();

  const filtered = tasks.filter((task) => {
    if (opts.employeeId !== 'all' && task.assigned_to !== opts.employeeId) return false;

    switch (opts.filter) {
      case 'open':
        if (task.status !== 'open') return false;
        break;
      case 'completed':
        if (task.status !== 'completed') return false;
        break;
      case 'overdue':
        if (!isTaskOverdue(task)) return false;
        break;
      case 'not_viewed':
        if (task.first_viewed_at || task.status === 'completed') return false;
        break;
      case 'viewed':
        if (!task.first_viewed_at) return false;
        break;
      case 'urgent':
        if (task.urgency !== 'urgent') return false;
        break;
      case 'due_today':
        if (task.status === 'completed' || !isTaskDueToday(task)) return false;
        break;
      case 'completed_today':
        if (task.status !== 'completed' || task.completed_at?.slice(0, 10) !== todayLocalISODate())
          return false;
        break;
      case 'all':
      default:
        break;
    }

    if (search) {
      const haystack = `${task.title} ${task.description}`.toLowerCase();
      if (!haystack.includes(search)) return false;
    }

    return true;
  });

  return filtered.sort((a, b) => {
    // Open tasks first, then by due date/time, then by urgency (most urgent first).
    if (a.status !== b.status) return a.status === 'open' ? -1 : 1;
    const deadlineDiff = taskDeadline(a).getTime() - taskDeadline(b).getTime();
    if (deadlineDiff !== 0) return deadlineDiff;
    return urgencyWeight(a.urgency) - urgencyWeight(b.urgency);
  });
}
