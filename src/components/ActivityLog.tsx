import type { TaskEvent, TaskEventType } from '../types';
import { formatTimestamp } from '../lib/dates';

const EVENT_LABELS: Record<TaskEventType, string> = {
  created: 'Task assigned',
  viewed: 'Viewed by employee',
  completed: 'Marked complete',
  reopened: 'Reopened',
  edited: 'Details edited',
  due_date_changed: 'Due date changed',
  urgency_changed: 'Urgency changed',
  deleted: 'Deleted',
};

export default function ActivityLog({ events, loading }: { events: TaskEvent[]; loading: boolean }) {
  if (loading) {
    return <p className="muted">Loading activity...</p>;
  }

  if (events.length === 0) {
    return <p className="muted">No activity yet.</p>;
  }

  return (
    <ul className="activity-log">
      {events.map((event) => (
        <li key={event.id} className="activity-log-item">
          <span className="activity-log-time">{formatTimestamp(event.created_at)}</span>
          <span className="activity-log-label">{EVENT_LABELS[event.event_type] ?? event.event_type}</span>
        </li>
      ))}
    </ul>
  );
}
