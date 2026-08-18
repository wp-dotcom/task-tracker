import type { TaskWithProfiles } from '../types';
import { formatDueDate, formatDueTime, isTaskDueSoon, isTaskOverdue } from '../lib/dates';
import { useNow } from '../lib/useNow';
import UrgencyBadge from './UrgencyBadge';

interface TaskCardProps {
  task: TaskWithProfiles;
  onClick: () => void;
  showAssignee?: boolean;
}

export default function TaskCard({ task, onClick, showAssignee = false }: TaskCardProps) {
  // Ticks every minute so a task starts flashing exactly when it becomes due
  // soon, not just whenever something else happens to re-render this card.
  const now = useNow();
  const overdue = isTaskOverdue(task);
  const completed = task.status === 'completed';
  const unviewed = !completed && !task.first_viewed_at;
  const dueSoon = isTaskDueSoon(task, now);

  return (
    <button
      type="button"
      className={`task-card${completed ? ' task-card-completed' : ''}${overdue ? ' task-card-overdue' : ''}${unviewed ? ' task-card-unviewed' : ''}${dueSoon ? ' task-card-due-soon' : ''}`}
      onClick={onClick}
    >
      <div className="task-card-main">
        <span className={`task-card-title${completed ? ' strike' : ''}`}>
          {completed && <span aria-hidden="true">✓ </span>}
          {task.recurrence_id && (
            <span aria-label="Repeating task" title="Repeating task">
              🔁{' '}
            </span>
          )}
          {task.title}
        </span>
        <span className="task-card-due">
          {formatDueDate(task.due_date)}
          {task.due_time ? ` · ${formatDueTime(task.due_time)}` : ''}
          {showAssignee && task.assignee ? ` · ${task.assignee.full_name}` : ''}
        </span>
      </div>
      <div className="task-card-side">
        {overdue && !completed && <span className="overdue-pill">Overdue</span>}
        {dueSoon && <span className="due-soon-pill">Due soon</span>}
        {unviewed && <span className="new-pill">New</span>}
        <UrgencyBadge urgency={task.urgency} />
      </div>
    </button>
  );
}
