import { useState } from 'react';
import type { CalendarEventWithCreator } from '../types';
import { useAuth } from '../context/AuthContext';
import { useCalendarEvents } from '../context/CalendarEventsContext';
import { useToast } from '../context/ToastContext';
import { formatDueDate, formatDueTime, formatTimestamp, isCalendarEventDueSoon } from '../lib/dates';
import { useNow } from '../lib/useNow';
import { CALENDAR_EVENT_META } from '../lib/calendarEventMeta';
import { getErrorMessage } from '../lib/errors';
import ConfirmDialog from './ConfirmDialog';
import CalendarEventFormModal from './CalendarEventFormModal';

interface CalendarEventDetailsModalProps {
  event: CalendarEventWithCreator | null;
  onClose: () => void;
}

export default function CalendarEventDetailsModal({ event, onClose }: CalendarEventDetailsModalProps) {
  const { profile } = useAuth();
  const { deleteCalendarEvent } = useCalendarEvents();
  const { showToast } = useToast();
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const now = useNow();

  if (!event) return null;

  const meta = CALENDAR_EVENT_META[event.event_type];
  const canManage = profile?.role === 'admin' || profile?.id === event.created_by;
  const dueSoon = isCalendarEventDueSoon(event, now);

  async function handleDelete() {
    if (!event) return;
    setBusy(true);
    setError(null);
    try {
      await deleteCalendarEvent(event.id);
      setConfirmDelete(false);
      showToast('Entry deleted');
      onClose();
    } catch (err) {
      setError(getErrorMessage(err));
      setBusy(false);
    }
  }

  if (editing) {
    return (
      <CalendarEventFormModal open={editing} event={event} onClose={() => setEditing(false)} />
    );
  }

  return (
    <div className="modal-overlay" role="presentation" onClick={onClose}>
      <div
        className="modal-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="calendar-event-details-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="task-details-header">
          <h2 id="calendar-event-details-title">
            <span aria-hidden="true">{meta.icon}</span> {event.title}
          </h2>
          <span
            className="calendar-event-type-badge"
            style={{ color: meta.color, background: meta.background }}
          >
            <span aria-hidden="true">{meta.icon}</span>
            {meta.label}
          </span>
        </div>

        <div className="task-details-meta">
          {dueSoon && <span className="due-soon-pill">Due soon</span>}
          <span className="task-details-assignee">Added by {event.creator?.full_name ?? 'Unknown'}</span>
        </div>

        {event.description && <p className="task-details-description">{event.description}</p>}

        <dl className="task-details-grid">
          <div>
            <dt>Date</dt>
            <dd>
              {formatDueDate(event.event_date)}
              {event.event_time ? ` at ${formatDueTime(event.event_time)}` : ''}
            </dd>
          </div>
          <div>
            <dt>Added</dt>
            <dd>{formatTimestamp(event.created_at)}</dd>
          </div>
        </dl>

        {error && (
          <div role="alert" className="form-error">
            {error}
          </div>
        )}

        <div className="task-details-actions">
          {canManage && (
            <>
              <button type="button" className="btn btn-ghost" onClick={() => setEditing(true)}>
                Edit
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-danger-text"
                onClick={() => setConfirmDelete(true)}
              >
                Delete
              </button>
            </>
          )}
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Close
          </button>
        </div>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        title="Delete this entry?"
        message={`"${event.title}" will be permanently deleted. This cannot be undone.`}
        confirmLabel={busy ? 'Deleting...' : 'Delete'}
        danger
        busy={busy}
        onConfirm={handleDelete}
        onCancel={() => setConfirmDelete(false)}
      />
    </div>
  );
}
