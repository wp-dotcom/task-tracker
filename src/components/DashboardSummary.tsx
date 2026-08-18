import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import type { TaskWithProfiles } from '../types';
import { isTaskDueToday, isTaskOverdue, todayLocalISODate } from '../lib/dates';

export default function DashboardSummary({ tasks }: { tasks: TaskWithProfiles[] }) {
  const stats = useMemo(() => {
    const today = todayLocalISODate();
    let dueToday = 0;
    let overdue = 0;
    let notViewed = 0;
    let completedToday = 0;

    for (const task of tasks) {
      if (task.status !== 'completed' && isTaskDueToday(task)) dueToday += 1;
      if (isTaskOverdue(task)) overdue += 1;
      if (task.status !== 'completed' && !task.first_viewed_at) notViewed += 1;
      if (task.status === 'completed' && task.completed_at?.slice(0, 10) === today) completedToday += 1;
    }

    return { dueToday, overdue, notViewed, completedToday };
  }, [tasks]);

  return (
    <div className="dashboard-summary">
      <Link to="/tasks?filter=due_today" className="summary-stat summary-stat-link">
        <span className="summary-value">{stats.dueToday}</span>
        <span className="summary-label">Due today</span>
      </Link>
      <Link
        to="/tasks?filter=overdue"
        className="summary-stat summary-stat-warn summary-stat-link"
      >
        <span className="summary-value">{stats.overdue}</span>
        <span className="summary-label">Overdue</span>
      </Link>
      <Link to="/tasks?filter=not_viewed" className="summary-stat summary-stat-link">
        <span className="summary-value">{stats.notViewed}</span>
        <span className="summary-label">Not viewed</span>
      </Link>
      <Link
        to="/tasks?filter=completed_today"
        className="summary-stat summary-stat-good summary-stat-link"
      >
        <span className="summary-value">{stats.completedToday}</span>
        <span className="summary-label">Completed today</span>
      </Link>
    </div>
  );
}
