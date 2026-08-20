import { useEffect, useRef, useState } from 'react';
import type { TaskWithProfiles } from '../types';
import { useAuth } from '../context/AuthContext';
import { useTasks } from '../context/TasksContext';
import { useToast } from '../context/ToastContext';
import { useTaskEvents } from '../hooks/useTaskEvents';
import { formatDueDate, formatDueTime, formatTimestamp, isTaskDueSoon, isTaskOverdue } from '../lib/dates';
import { getErrorMessage } from '../lib/errors';
import { playCompletionSound } from '../lib/completionEffects';
import UrgencyBadge from './UrgencyBadge';
import ActivityLog from './ActivityLog';
import ConfirmDialog from './ConfirmDialog';
import TaskFormModal from './TaskFormModal';
import TaskComments from './TaskComments';
import TaskPhotos from './TaskPhotos';
import TaskReminders from './TaskReminders';
import CompletionBurst, { BURST_LIFETIME_MS } from './CompletionBurst';

interface TaskDetailsModalProps {
  task: TaskWithProfiles | null;
  onClose: () => void;
}

export default function TaskDetailsModal({ task, onClose }: TaskDetailsModalProps) {
  const { profile } = useAuth();
  const { markViewed, completeTask, reopenTask, deleteTask, stopRecurrence } = useTasks();
  const { showToast } = useToast();
  const { events, loading: eventsLoading, refresh: refreshEvents } = useTaskEvents(task?.id ?? null);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmReopen, setConfirmReopen] = useState(false);
  const [confirmStopRecurrence, setConfirmStopRecurrence] = useState(false);
  const [editing, setEditing] = useState(false);
  const [duplicating, setDuplicating] = useState(false);
  const [justCompleted, setJustCompleted] = useState(false);

  const isAdmin = profile?.role === 'admin';
  const isOwner = task && profile ? task.assigned_to === profile.id : false;
  const isCreator = task && profile ? task.created_by === profile.id : false;
  // A "self-created" task is one someone added for themselves, as opposed to
  // one tagged/assigned to someone else (by an admin, or now by a coworker
  // too — see tasks_insert_own in schema.sql).
  const isSelfCreated = task ? task.created_by === task.assigned_to : false;
  // Whoever created a task can edit or delete it — whether it's their own
  // personal to-do or one they tagged a coworker/admin on — same as
  // tasks_update_own/tasks_delete_own in schema.sql. An admin can always
  // edit/delete any task regardless of who created it.
  const canEditOrDelete = isAdmin || isCreator;
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
  const dueSoon = isTaskDueSoon(task);

  async function handleComplete() {
    if (!task) return;
    setBusy(true);
    setError(null);
    try {
      await completeTask(task.id);
      playCompletionSound();
      setJustCompleted(true);
      showToast('Marked complete');
      // Give the completion burst a moment to actually be seen before the
      // modal closes out from under it — closing immediately would mean
      // nobody ever sees it play.
      setTimeout(onClose, BURST_LIFETIME_MS);
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
      showToast('Task reopened');
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
      showToast('Task deleted');
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
      showToast('Series stopped');
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

  if (duplicating) {
    return (
      <TaskFormModal
        open={duplicating}
        duplicateFrom={task}
        onClose={() => setDuplicating(false)}
        onSaved={() => setDuplicating(false)}
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
        <button type="button" className="modal-close-x" aria-label="Close" onClick={onClose}>
          ×
        </button>

        {justCompleted && <CompletionBurst onDone={() => setJustCompleted(false)} />}

        <div className="task-details-header">
          <h2 id="task-details-title" className={task.status === 'completed' ? 'strike' : ''}>
            {task.title}
          </h2>
          <UrgencyBadge urgency={task.urgency} />
        </div>

        <div className="task-details-meta">
          <span
            className={`status-pill status-${task.status}${dueSoon ? ' status-due-soon' : ''}`}
          >
            {task.status === 'completed' ? 'Completed' : overdue ? 'Overdue' : dueSoon ? 'Due soon' : 'Open'}
          </span>
          {isSelfCreated
            ? // Your own self-added task: nothing more to say to you about
              // it. Admin still sees who added it, for context on a task
              // they didn't create themselves.
              isAdmin && (
                <span className="task-details-assignee">
                  Self-added by {task.assignee?.full_name ?? 'Unknown'}
                </span>
              )
            : (
                <span className="task-details-assignee">
                  {isOwner
                    ? // Could've been tagged by an admin or by a coworker —
                      // either way, worth knowing who assigned it to you.
                      `Assigned to you by ${task.creator?.full_name ?? 'Unknown'}`
                    : isCreator
                      ? `Assigned to ${task.assignee?.full_name ?? 'Unknown'}`
                      : // Neither owner nor creator: an admin looking in on a
                        // task one employee tagged another with.
                        `Assigned to ${task.assignee?.full_name ?? 'Unknown'} by ${task.creator?.full_name ?? 'Unknown'}`}
                </span>
              )}
          {recurrenceLabel && (
            <span className="task-details-recurrence">
              ↻ {task.recurrence?.active ? `Repeats ${recurrenceLabel}` : 'Repeating series (stopped)'}
            </span>
          )}
        </div>

        {task.description && <p className="task-details-description">{task.description}</p>}

        <dl className="task-details-grid">
          <div>
            <dt>Due</dt>
            <dd className="meta-value">
              {formatDueDate(task.due_date)}
              {task.due_time && <span className="meta-sub">{formatDueTime(task.due_time)}</span>}
            </dd>
          </div>
          <div>
            <dt>Created</dt>
            <dd className="meta-value">{formatTimestamp(task.created_at)}</dd>
          </div>
          <div>
            <dt>Viewed</dt>
            <dd className={`meta-value${task.first_viewed_at ? ' meta-value-positive' : ' meta-value-muted'}`}>
              {task.first_viewed_at ? (
                <>
                  <span className="meta-dot meta-dot-positive" aria-hidden="true" />
                  Yes
                  <span className="meta-sub">{formatTimestamp(task.first_viewed_at)}</span>
                </>
              ) : (
                'Not viewed yet'
              )}
            </dd>
          </div>
          {task.last_viewed_at && task.last_viewed_at !== task.first_viewed_at && (
            <div>
              <dt>Last viewed</dt>
              <dd className="meta-value">{formatTimestamp(task.last_viewed_at)}</dd>
            </div>
          )}
          <div>
            <dt>Completed</dt>
            <dd className={`meta-value${task.completed_at ? ' meta-value-positive' : ' meta-value-muted'}`}>
              {task.completed_at ? (
                <>
                  <span className="meta-dot meta-dot-positive" aria-hidden="true" />
                  {formatTimestamp(task.completed_at)}
                </>
              ) : (
                'Not completed'
              )}
            </dd>
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
              Mark Complete
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
              <button type="button" className="btn btn-ghost" onClick={() => setDuplicating(true)}>
                Duplicate
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
          <button type="button" className="btn btn-secondary task-details-close-btn" onClick={onClose}>
            Close
          </button>
        </div>

        {task.status === 'open' && <TaskReminders taskId={task.id} />}

        <TaskPhotos taskId={task.id} />

        <TaskComments taskId={task.id} />

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
