import type { TaskWithProfiles } from '../types';
import { formatDueDate, formatDueTime, isTaskOverdue } from '../lib/dates';
import UrgencyBadge from './UrgencyBadge';

interface TaskCardProps {
  task: TaskWithProfiles;
  onClick: () => void;
  showAssignee?: boolean;
}

export default function TaskCard({ task, onClick, showAssignee = false }: TaskCardProps) {
  const overdue = isTaskOverdue(task);
  const completed = task.status === 'completed';
  const unviewed = !completed && !task.first_viewed_at;

  return (
    <button
      type="button"
      className={`task-card${completed ? ' task-card-completed' : ''}${overdue ? ' task-card-overdue' : ''}${unviewed ? ' task-card-unviewed' : ''}`}
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
        {unviewed && <span className="new-pill">New</span>}
        <UrgencyBadge urgency={task.urgency} />
      </div>
    </button>
  );
}
