import { useRef, useState } from 'react';
import type { TouchEvent } from 'react';
import type { TaskWithProfiles } from '../types';
import { formatDueDate, formatDueTime, isTaskDueSoon, isTaskOverdue } from '../lib/dates';
import { useNow } from '../lib/useNow';
import { useAuth } from '../context/AuthContext';
import { useTasks } from '../context/TasksContext';
import { useToast } from '../context/ToastContext';
import { getErrorMessage } from '../lib/errors';
import { playCompletionSound } from '../lib/completionEffects';
import { employeeInitials } from '../lib/employeeColors';
import UrgencyBadge from './UrgencyBadge';
import ConfirmDialog from './ConfirmDialog';
import CompletionBurst from './CompletionBurst';

interface TaskCardProps {
  task: TaskWithProfiles;
  onClick: () => void;
  showAssignee?: boolean;
  /** Which of the 8 fixed badge colors (src/index.css --employee-color-1..8)
   * to use for the assignee badge — computed by the parent from its own
   * employees list via employeeColorSlot(), since this card doesn't have
   * that full list itself. Only relevant when showAssignee is true. */
  assigneeColorSlot?: number;
  /** Bulk-select mode (Admin Tasks page): shows a checkbox and swallows the
   * click into onToggleSelect instead of opening details. Swipe actions are
   * disabled while this is on, so the two gestures never fight each other. */
  selectable?: boolean;
  selected?: boolean;
  onToggleSelect?: () => void;
}

const REVEAL_PX = 84;
const SWIPE_THRESHOLD_PX = 40;
const TAP_SLOP_PX = 8;

export default function TaskCard({
  task,
  onClick,
  showAssignee = false,
  assigneeColorSlot = 0,
  selectable = false,
  selected = false,
  onToggleSelect,
}: TaskCardProps) {
  // Ticks every minute so a task starts flashing exactly when it becomes due
  // soon, not just whenever something else happens to re-render this card.
  const now = useNow();
  const { profile } = useAuth();
  const { completeTask, deleteTask } = useTasks();
  const { showToast } = useToast();

  const overdue = isTaskOverdue(task);
  const completed = task.status === 'completed';
  const unviewed = !completed && !task.first_viewed_at;
  const dueSoon = isTaskDueSoon(task, now);

  // Same permission rules as TaskDetailsModal's Mark Complete / Delete
  // buttons — swiping is just a faster path to the same actions, not a
  // separate permission model.
  const isAdmin = profile?.role === 'admin';
  const isOwner = profile ? task.assigned_to === profile.id : false;
  const isCreator = profile ? task.created_by === profile.id : false;
  const canComplete = !completed && (isAdmin || isOwner);
  // Whoever created the task can delete it — same as canEditOrDelete in
  // TaskDetailsModal (see tasks_delete_own in schema.sql) — regardless of
  // who it's currently assigned to.
  const canDelete = isAdmin || isCreator;
  const swipeEnabled = !selectable && (canComplete || canDelete);

  const [dragX, setDragX] = useState(0);
  const [revealed, setRevealed] = useState<'none' | 'left' | 'right'>('none');
  const [swipeBusy, setSwipeBusy] = useState(false);
  const [confirmSwipeDelete, setConfirmSwipeDelete] = useState(false);
  const [justCompleted, setJustCompleted] = useState(false);
  // Tracks whether a drag is actively in progress, so CSS can disable the
  // snap transition while live-tracking the finger (1:1, no lag) and only
  // re-enable it for the snap-open/snap-back on release.
  const [isDragging, setIsDragging] = useState(false);
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);
  const draggingRef = useRef(false);

  function resetSwipe() {
    setDragX(0);
    setRevealed('none');
    setIsDragging(false);
  }

  function handleTouchStart(e: TouchEvent) {
    if (!swipeEnabled) return;
    touchStartX.current = e.touches[0]?.clientX ?? null;
    touchStartY.current = e.touches[0]?.clientY ?? null;
    draggingRef.current = false;
  }

  function handleTouchMove(e: TouchEvent) {
    if (!swipeEnabled || touchStartX.current == null) return;
    const x = e.touches[0]?.clientX ?? touchStartX.current;
    const y = e.touches[0]?.clientY ?? touchStartY.current ?? 0;
    const dx = x - touchStartX.current;
    const dy = y - (touchStartY.current ?? 0);

    if (!draggingRef.current) {
      if (Math.abs(dx) < TAP_SLOP_PX && Math.abs(dy) < TAP_SLOP_PX) return;
      if (Math.abs(dy) > Math.abs(dx)) {
        // Vertical scroll, not a swipe — bail out entirely for this touch.
        touchStartX.current = null;
        return;
      }
      draggingRef.current = true;
      setIsDragging(true);
    }

    const base = revealed === 'left' ? REVEAL_PX : revealed === 'right' ? -REVEAL_PX : 0;
    let next = base + dx;
    if (!canComplete) next = Math.min(next, 0);
    if (!canDelete) next = Math.max(next, 0);
    next = Math.max(-REVEAL_PX, Math.min(REVEAL_PX, next));
    setDragX(next);
  }

  function handleTouchEnd() {
    if (!swipeEnabled || touchStartX.current == null) return;
    touchStartX.current = null;
    if (!draggingRef.current) return; // was a tap — let the card's own onClick handle it
    draggingRef.current = false;
    setIsDragging(false);
    if (dragX >= SWIPE_THRESHOLD_PX) {
      setDragX(REVEAL_PX);
      setRevealed('left');
    } else if (dragX <= -SWIPE_THRESHOLD_PX) {
      setDragX(-REVEAL_PX);
      setRevealed('right');
    } else {
      resetSwipe();
    }
  }

  function handleCardClick() {
    if (revealed !== 'none') {
      resetSwipe();
      return;
    }
    if (selectable) {
      onToggleSelect?.();
      return;
    }
    onClick();
  }

  async function handleSwipeComplete() {
    if (swipeBusy) return;
    setSwipeBusy(true);
    try {
      await completeTask(task.id);
      playCompletionSound();
      setJustCompleted(true);
      showToast('Marked complete');
    } catch (err) {
      showToast(getErrorMessage(err), 'error');
    } finally {
      setSwipeBusy(false);
      resetSwipe();
    }
  }

  async function handleSwipeDelete() {
    if (swipeBusy) return;
    setSwipeBusy(true);
    try {
      await deleteTask(task.id);
      showToast('Task deleted');
      setConfirmSwipeDelete(false);
    } catch (err) {
      showToast(getErrorMessage(err), 'error');
    } finally {
      setSwipeBusy(false);
      resetSwipe();
    }
  }

  return (
    <div className="task-card-swipe-wrap">
      {swipeEnabled && (
        <div className="task-card-swipe-actions" aria-hidden={revealed === 'none'}>
          <button
            type="button"
            className="task-card-swipe-action task-card-swipe-complete"
            style={{ opacity: revealed === 'left' ? 1 : 0, pointerEvents: revealed === 'left' ? 'auto' : 'none' }}
            onClick={handleSwipeComplete}
            tabIndex={revealed === 'left' ? 0 : -1}
          >
            Complete
          </button>
          <button
            type="button"
            className="task-card-swipe-action task-card-swipe-delete"
            style={{ opacity: revealed === 'right' ? 1 : 0, pointerEvents: revealed === 'right' ? 'auto' : 'none' }}
            onClick={() => setConfirmSwipeDelete(true)}
            tabIndex={revealed === 'right' ? 0 : -1}
          >
            Delete
          </button>
        </div>
      )}

      <button
        type="button"
        className={`task-card${completed ? ' task-card-completed' : ''}${overdue ? ' task-card-overdue' : ''}${unviewed ? ' task-card-unviewed' : ''}${dueSoon ? ' task-card-due-soon' : ''}${selectable ? ' task-card-selectable' : ''}${isDragging ? ' task-card-dragging' : ''}`}
        style={swipeEnabled ? { transform: `translateX(${dragX}px)` } : undefined}
        onClick={handleCardClick}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {selectable && (
          <span
            className={`task-card-checkbox${selected ? ' checked' : ''}`}
            aria-hidden="true"
          >
            {selected && '✓'}
          </span>
        )}
        <div className="task-card-main">
          <span className={`task-card-title${completed ? ' strike' : ''}`}>
            {task.recurrence_id && (
              <span aria-label="Repeating task" title="Repeating task">
                ↻{' '}
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
          {showAssignee && task.assignee && (
            <span
              className={`employee-badge employee-badge-${assigneeColorSlot}`}
              title={task.assignee.full_name}
            >
              {employeeInitials(task.assignee.full_name)}
            </span>
          )}
          {overdue && !completed && <span className="overdue-pill">Overdue</span>}
          {dueSoon && <span className="due-soon-pill">Due soon</span>}
          {unviewed && <span className="new-pill">New</span>}
          <UrgencyBadge urgency={task.urgency} />
        </div>
      </button>

      {justCompleted && <CompletionBurst onDone={() => setJustCompleted(false)} />}

      <ConfirmDialog
        open={confirmSwipeDelete}
        title="Delete this task?"
        message={`"${task.title}" will be permanently deleted. This cannot be undone.`}
        confirmLabel={swipeBusy ? 'Deleting...' : 'Delete'}
        danger
        busy={swipeBusy}
        onConfirm={handleSwipeDelete}
        onCancel={() => {
          setConfirmSwipeDelete(false);
          resetSwipe();
        }}
      />
    </div>
  );
}
