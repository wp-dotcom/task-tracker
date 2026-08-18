import { useEffect, useRef, useState } from 'react';
import type { TaskWithProfiles } from '../types';
import { useAuth } from '../context/AuthContext';
import { useTasks } from '../context/TasksContext';
import { useTaskEvents } from '../hooks/useTaskEvents';
import { formatDueDate, formatDueTime, formatTimestamp, isTaskOverdue } from '../lib/dates';
import { getErrorMessage } from '../lib/errors';
import UrgencyBadge from './UrgencyBadge';
import ActivityLog from './ActivityLog';
import ConfirmDialog from './ConfirmDialog';
import TaskFormModal from './TaskFormModal';

interface TaskDetailsModalProps {
  task: TaskWithProfiles | null;
  onClose: () => void;
}

export default function TaskDetailsModal({ task, onClose }: TaskDetailsModalProps) {
  const { profile } = useAuth();
  const { markViewed, completeTask, reopenTask, deleteTask, stopRecurrence } = useTasks();
  const { events, loading: eventsLoading, refresh: refreshEvents } = useTaskEvents(task?.id ?? null);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmReopen, setConfirmReopen] = useState(false);
  const [confirmStopRecurrence, setConfirmStopRecurrence] = useState(false);
  const [editing, setEditing] = useState(false);

  const isAdmin = profile?.role === 'admin';
  const isOwner = task && profile ? task.assigned_to === profile.id : false;
  // A "self-created" task is one the employee added for themselves, as
  // opposed to one an admin assigned to them — see the tasks_insert_self RLS
  // policy in schema.sql, which is the source of truth for this invariant.
  const isSelfCreated = task ? task.created_by === task.assigned_to : false;
  const canEditOrDelete = isAdmin || (isOwner && isSelfCreated);
  const recurrenceLabel = task?.recurrence
    ? { daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly', weekdays: 'Every weekday' }[
        task.recurrence.frequency
      ]
    : null;
  const canStopRecurrence = Boolean(task?.recurrence_id && task?.recurrence?.active && canEditOrDelete);
  const viewedTaskId = useRef<string | null>(null);

  // Record a view exactly once per modal-open, only for the employee opening
  // their own task. Never for admin previews (see mark_task_viewed RPC).
  useEffect(() => {
    if (!task || !profile) return;
    if (profile.role !== 'employee' || task.assigned_to !== profile.id) return;
    if (viewedTaskId.current === task.id) return;
    viewedTaskId.current = task.id;
    markViewed(task.id).catch((err) => setError(getErrorMessage(err)));
  }, [task, profile, markViewed]);

  if (!task) return null;

  const overdue = isTaskOverdue(task);

  async function handleComplete() {
    if (!task) return;
    setBusy(true);
    setError(null);
    try {
      await completeTask(task.id);
      onClose();
    } catch (err) {
      setError(getErrorMessage(err));
      setBusy(false);
    }
  }

  async function handleReopen() {
    if (!task) return;
    setBusy(true);
    setError(null);
    try {
      await reopenTask(task.id);
      await refreshEvents();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
      setConfirmReopen(false);
    }
  }

  async function handleDelete() {
    if (!task) return;
    setBusy(true);
    setError(null);
    try {
      await deleteTask(task.id);
      setConfirmDelete(false);
      onClose();
    } catch (err) {
      setError(getErrorMessage(err));
      setBusy(false);
    }
  }

  async function handleStopRecurrence() {
    if (!task || !task.recurrence_id) return;
    setBusy(true);
    setError(null);
    try {
      await stopRecurrence(task.recurrence_id);
      setConfirmStopRecurrence(false);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (editing) {
    return (
      <TaskFormModal
        open={editing}
        task={task}
        onClose={() => setEditing(false)}
        onSaved={() => setEditing(false)}
      />
    );
  }

  return (
    <div className="modal-overlay" role="presentation" onClick={onClose}>
      <div
        className="modal-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="task-details-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="task-details-header">
          <h2 id="task-details-title" className={task.status === 'completed' ? 'strike' : ''}>
            {task.title}
          </h2>
          <UrgencyBadge urgency={task.urgency} />
        </div>

        <div className="task-details-meta">
          <span className={`status-pill status-${task.status}`}>
            {task.status === 'completed' ? 'Completed' : overdue ? 'Overdue' : 'Open'}
          </span>
          {isAdmin && (
            <span className="task-details-assignee">
              {isSelfCreated
                ? `Self-added by ${task.assignee?.full_name ?? 'Unknown'}`
                : `Assigned to ${task.assignee?.full_name ?? 'Unknown'}`}
            </span>
          )}
          {recurrenceLabel && (
            <span className="task-details-recurrence">
              🔁 {task.recurrence?.active ? `Repeats ${recurrenceLabel}` : 'Repeating series (stopped)'}
            </span>
          )}
        </div>

        {task.description && <p className="task-details-description">{task.description}</p>}

        <dl className="task-details-grid">
          <div>
            <dt>Due</dt>
            <dd>
              {formatDueDate(task.due_date)}
              {task.due_time ? ` at ${formatDueTime(task.due_time)}` : ''}
            </dd>
          </div>
          <div>
            <dt>Created</dt>
            <dd>{formatTimestamp(task.created_at)}</dd>
          </div>
          <div>
            <dt>Viewed</dt>
            <dd>
              {task.first_viewed_at
                ? `Yes — ${formatTimestamp(task.first_viewed_at)}`
                : 'Not viewed yet'}
            </dd>
          </div>
          {task.last_viewed_at && task.last_viewed_at !== task.first_viewed_at && (
            <div>
              <dt>Last viewed</dt>
              <dd>{formatTimestamp(task.last_viewed_at)}</dd>
            </div>
          )}
          <div>
            <dt>Completed</dt>
            <dd>{task.completed_at ? formatTimestamp(task.completed_at) : 'Not completed'}</dd>
          </div>
        </dl>

        {error && (
          <div role="alert" className="form-error">
            {error}
          </div>
        )}

        <div className="task-details-actions">
          {task.status === 'open' && (isAdmin || isOwner) && (
            <button type="button" className="btn btn-success btn-lg" onClick={handleComplete} disabled={busy}>
              ✓ Mark Complete
            </button>
          )}
          {task.status === 'completed' && (isAdmin || isOwner) && (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setConfirmReopen(true)}
              disabled={busy}
            >
              Reopen task
            </button>
          )}
          {canEditOrDelete && (
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
          {canStopRecurrence && (
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => setConfirmStopRecurrence(true)}
            >
              Stop repeating
            </button>
          )}
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Close
          </button>
        </div>

        {isAdmin && (
          <div className="task-details-activity">
            <h3>Activity</h3>
            <ActivityLog events={events} loading={eventsLoading} />
          </div>
        )}
      </div>

      <ConfirmDialog
        open={confirmDelete}
        title="Delete this task?"
        message={`"${task.title}" will be permanently deleted. This cannot be undone.`}
        confirmLabel={busy ? 'Deleting...' : 'Delete'}
        danger
        busy={busy}
        onConfirm={handleDelete}
        onCancel={() => setConfirmDelete(false)}
      />

      <ConfirmDialog
        open={confirmReopen}
        title="Reopen this task?"
        message="The task will become active again and its completion timestamp will be cleared."
        confirmLabel={busy ? 'Reopening...' : 'Reopen'}
        busy={busy}
        onConfirm={handleReopen}
        onCancel={() => setConfirmReopen(false)}
      />

      <ConfirmDialog
        open={confirmStopRecurrence}
        title="Stop repeating this task?"
        message="This task stays as-is, but no new occurrences will be created, and any other upcoming (not-yet-completed) occurrences in this series will be removed."
        confirmLabel={busy ? 'Stopping...' : 'Stop repeating'}
        busy={busy}
        onConfirm={handleStopRecurrence}
        onCancel={() => setConfirmStopRecurrence(false)}
      />
    </div>
  );
}
