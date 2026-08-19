import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import type {
  Profile,
  TaskRecurrenceFrequency,
  TaskTemplate,
  TaskUrgency,
  TaskWithProfiles,
} from '../types';
import { useAuth } from '../context/AuthContext';
import { useTasks } from '../context/TasksContext';
import { useToast } from '../context/ToastContext';
import { useEmployees } from '../hooks/useEmployees';
import { useTaskTemplates } from '../hooks/useTaskTemplates';
import { getErrorMessage } from '../lib/errors';
import { todayLocalISODate } from '../lib/dates';
import { createTaskReminders } from '../lib/api';
import { URGENCY_META, URGENCY_ORDER } from '../lib/urgency';
import TaskTemplateFormModal from './TaskTemplateFormModal';
import TimeSelect from './TimeSelect';
import ConfirmDialog from './ConfirmDialog';
import Dropdown from './Dropdown';
import ReminderOffsetPicker from './ReminderOffsetPicker';

interface TaskFormModalProps {
  open: boolean;
  onClose: () => void;
  /** When set, the modal edits this task instead of creating a new one. */
  task?: TaskWithProfiles | null;
  /**
   * When set (and `task` isn't), pre-fills the form from this task's
   * fields but stays in create mode — used by "Duplicate task". Due date
   * defaults to today rather than copying the original's (likely past) date.
   */
  duplicateFrom?: TaskWithProfiles | null;
  /** Pre-fill the due date, e.g. when created from a calendar date click. */
  defaultDate?: string;
  /** Pre-fill the due time ("HH:MM"), e.g. when created from a week/day calendar time-slot click. */
  defaultTime?: string;
  onSaved?: (taskId: string) => void;
}

export default function TaskFormModal({
  open,
  onClose,
  task = null,
  duplicateFrom = null,
  defaultDate,
  defaultTime,
  onSaved,
}: TaskFormModalProps) {
  const { profile } = useAuth();
  const { createTask, createTaskRecurrence, updateTask, markViewed } = useTasks();
  const { showToast } = useToast();
  const { employees, loading: employeesLoading } = useEmployees();
  const { templates, refresh: refreshTemplates } = useTaskTemplates();

  const isAdmin = profile?.role === 'admin';

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [assignedTo, setAssignedTo] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [dueTime, setDueTime] = useState('');
  const [urgency, setUrgency] = useState<TaskUrgency>('normal');
  const [repeat, setRepeat] = useState<TaskRecurrenceFrequency | 'none'>('none');
  // Only used in create mode — there's no task id to attach task_reminders
  // rows to yet, so these are applied in a follow-up insert right after the
  // task itself is created (see handleSubmit below). Editing an existing
  // task manages reminders live via TaskReminders in TaskDetailsModal
  // instead, since that's reachable for admin-assigned tasks too (this form
  // isn't — see canEditOrDelete in TaskDetailsModal).
  const [reminderOffsets, setReminderOffsets] = useState<number[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [templateFormOpen, setTemplateFormOpen] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  // Move focus into the dialog when it opens, but onto the panel itself
  // rather than straight into the title field — autofocusing a text input
  // pops the on-screen keyboard open immediately on phones/tablets, which
  // covers half the form before anyone's asked to type anything. Desktop
  // keyboard users still land inside the dialog (Tab reaches the fields
  // right away); they just take one Tab press to reach the title field
  // instead of arriving already inside it.
  useEffect(() => {
    if (open) panelRef.current?.focus();
  }, [open]);

  const isEdit = Boolean(task);
  // In edit mode, "dirty" means changed from the task being edited. In
  // create mode (including duplicating), there's no baseline to diff
  // against, so it just means "you've actually started writing something" —
  // proportionate to what's actually costly to lose (a typed-out title or
  // set of instructions), without false-positiving on defaults that
  // auto-fill (e.g. the assignee once the employee list loads).
  const dirty =
    isEdit && task
      ? title !== task.title ||
        description !== task.description ||
        assignedTo !== task.assigned_to ||
        dueDate !== task.due_date ||
        dueTime !== (task.due_time ? task.due_time.slice(0, 5) : '') ||
        urgency !== task.urgency
      : title.trim() !== '' || description.trim() !== '';

  function requestClose() {
    if (dirty) {
      setConfirmDiscard(true);
    } else {
      onClose();
    }
  }

  function discardAndClose() {
    setConfirmDiscard(false);
    onClose();
  }

  useEffect(() => {
    if (!open) return;
    if (task) {
      setTitle(task.title);
      setDescription(task.description);
      setAssignedTo(task.assigned_to);
      setDueDate(task.due_date);
      setDueTime(task.due_time ? task.due_time.slice(0, 5) : '');
      setUrgency(task.urgency);
    } else if (duplicateFrom) {
      setTitle(duplicateFrom.title);
      setDescription(duplicateFrom.description);
      setAssignedTo(duplicateFrom.assigned_to);
      setDueDate(defaultDate ?? todayLocalISODate());
      setDueTime(duplicateFrom.due_time ? duplicateFrom.due_time.slice(0, 5) : '');
      setUrgency(duplicateFrom.urgency);
      setRepeat('none');
    } else {
      setTitle('');
      setDescription('');
      // Employees creating their own task are always the assignee; admins
      // pick from the employee list below.
      setAssignedTo(isAdmin ? '' : (profile?.id ?? ''));
      setDueDate(defaultDate ?? todayLocalISODate());
      setDueTime(defaultTime ?? '');
      setUrgency('normal');
      setRepeat('none');
    }
    setSelectedTemplateId('');
    // Always starts blank, even when editing/duplicating — reminders on an
    // existing task are managed live via TaskReminders instead (see the
    // reminderOffsets comment above), and duplicating doesn't copy the
    // original's reminders.
    setReminderOffsets([]);
    setError(null);
    setConfirmDiscard(false);
  }, [open, task, duplicateFrom, defaultDate, defaultTime, isAdmin, profile]);

  function toggleReminderOffset(offsetMinutes: number, nextSelected: boolean) {
    setReminderOffsets((prev) =>
      nextSelected ? [...prev, offsetMinutes] : prev.filter((m) => m !== offsetMinutes),
    );
  }

  function applyTemplate(template: TaskTemplate) {
    setTitle(template.title);
    setDescription(template.description);
    setUrgency(template.urgency);
  }

  function handleTemplateSelect(templateId: string) {
    setSelectedTemplateId(templateId);
    const template = templates.find((t) => t.id === templateId);
    if (template) applyTemplate(template);
  }

  function handleTemplateSaved(template: TaskTemplate) {
    refreshTemplates();
    setSelectedTemplateId(template.id);
    applyTemplate(template);
  }

  // Default the assignee to the (only, in v1) employee once loaded — admins only;
  // employees are always assigned to themselves (set above).
  useEffect(() => {
    if (open && isAdmin && !isEdit && !assignedTo && employees.length > 0) {
      setAssignedTo(employees[0].id);
    }
  }, [open, isAdmin, isEdit, assignedTo, employees]);

  if (!open) return null;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!title.trim()) {
      setError('Please enter a task title.');
      return;
    }
    if (!assignedTo) {
      setError('Please choose who this task is assigned to.');
      return;
    }
    if (!dueDate) {
      setError('Please choose a due date.');
      return;
    }

    setSubmitting(true);
    try {
      if (isEdit && task) {
        await updateTask(task.id, {
          title,
          description,
          assigned_to: assignedTo,
          due_date: dueDate,
          due_time: dueTime ? `${dueTime}:00` : null,
          urgency,
        });
        onSaved?.(task.id);
      } else {
        const created =
          repeat === 'none'
            ? await createTask({
                title,
                description,
                assigned_to: assignedTo,
                due_date: dueDate,
                due_time: dueTime ? `${dueTime}:00` : null,
                urgency,
              })
            : await createTaskRecurrence({
                title,
                description,
                assigned_to: assignedTo,
                urgency,
                frequency: repeat,
                due_time: dueTime ? `${dueTime}:00` : null,
                start_date: dueDate,
              });
        if (!isAdmin) {
          // Employee just created and is viewing their own task — mark it
          // viewed right away so it doesn't show a confusing "New" badge.
          markViewed(created.id).catch(() => {});
        }
        if (reminderOffsets.length > 0 && profile) {
          // Best-effort: the task itself is already created successfully at
          // this point, so a reminder-saving failure shouldn't block/undo
          // that — just let them know the reminders specifically didn't
          // stick, via a toast, rather than surfacing it as a form error.
          try {
            await createTaskReminders(created.id, reminderOffsets, profile.id);
          } catch {
            showToast("Task created, but the reminders didn't save — add them from the task's details.");
          }
        }
        onSaved?.(created.id);
      }
      showToast(isEdit ? 'Task updated' : repeat === 'none' ? 'Task created' : 'Recurring task created');
      onClose();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
    <div className="modal-overlay" role="presentation" onClick={requestClose}>
      <div
        ref={panelRef}
        className="modal-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="task-form-title"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <button type="button" className="modal-close-x" aria-label="Close" onClick={requestClose}>
          ×
        </button>

        <h2 id="task-form-title">
          {isEdit ? 'Edit task' : duplicateFrom ? 'Duplicate task' : isAdmin ? 'Add task' : 'Add my task'}
        </h2>

        {!isEdit && isAdmin && (
          <div className="template-picker">
            <div className="field-col" style={{ flex: 1 }}>
              <label className="field-label" htmlFor="task-template" style={{ marginTop: 0 }}>
                Start from a preset <span className="field-optional">(optional)</span>
              </label>
              <Dropdown
                id="task-template"
                value={selectedTemplateId}
                onChange={handleTemplateSelect}
                options={[
                  { value: '', label: 'None — start blank' },
                  ...templates.map((t) => ({ value: t.id, label: t.title })),
                ]}
                placeholder="None — start blank"
              />
            </div>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setTemplateFormOpen(true)}
              style={{ marginTop: 22 }}
            >
              + New preset
            </button>
          </div>
        )}

        <form onSubmit={handleSubmit} className="task-form">
          <label className="field-label" htmlFor="task-title">
            Title
          </label>
          <input
            id="task-title"
            className="field-input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Move teak dresser"
            required
          />

          <label className="field-label" htmlFor="task-description">
            Instructions
          </label>
          <textarea
            id="task-description"
            className="field-input field-textarea"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={isAdmin ? 'Add any details the employee needs...' : 'Add any notes for yourself...'}
            rows={4}
          />

          <div className="field-row">
            {isAdmin && (
              <div className="field-col">
                <label className="field-label" htmlFor="task-assignee">
                  Assigned to
                </label>
                <Dropdown
                  id="task-assignee"
                  value={assignedTo}
                  onChange={setAssignedTo}
                  options={employees.map((emp: Profile) => ({ value: emp.id, label: emp.full_name }))}
                  placeholder={employeesLoading ? 'Loading...' : 'Select employee'}
                />
              </div>
            )}

            <div className="field-col">
              <label className="field-label" htmlFor="task-urgency">
                Urgency
              </label>
              <Dropdown
                id="task-urgency"
                value={urgency}
                onChange={(v) => setUrgency(v as TaskUrgency)}
                options={URGENCY_ORDER.slice()
                  .reverse()
                  .map((u) => ({ value: u, label: URGENCY_META[u].label }))}
              />
            </div>
          </div>

          <div className="field-row">
            <div className="field-col">
              <label className="field-label" htmlFor="task-due-date">
                Due date
              </label>
              <input
                id="task-due-date"
                type="date"
                className="field-input"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                required
              />
              {dueDate && dueDate < todayLocalISODate() && (
                // A heads-up, not a block — backdating is sometimes
                // intentional (logging work already done), so this only
                // makes sure it's not an accident rather than refusing it.
                <p className="muted" style={{ fontSize: '0.8rem', marginTop: 4 }}>
                  This date is in the past — the task will start out overdue.
                </p>
              )}
            </div>
            <div className="field-col">
              <label className="field-label" htmlFor="task-due-time">
                Due time <span className="field-optional">(optional)</span>
              </label>
              <TimeSelect id="task-due-time" value={dueTime} onChange={setDueTime} />
            </div>
          </div>

          {!isEdit && (
            <div className="field-row">
              <div className="field-col">
                <label className="field-label" htmlFor="task-repeat">
                  Repeat <span className="field-optional">(optional)</span>
                </label>
                <Dropdown
                  id="task-repeat"
                  value={repeat}
                  onChange={(v) => setRepeat(v as TaskRecurrenceFrequency | 'none')}
                  options={[
                    { value: 'none', label: 'Does not repeat' },
                    { value: 'daily', label: 'Daily' },
                    { value: 'weekdays', label: 'Every weekday (Mon–Fri)' },
                    { value: 'weekly', label: 'Weekly (same day)' },
                    { value: 'monthly', label: 'Monthly (same date)' },
                  ]}
                />
              </div>
            </div>
          )}

          {!isEdit && (
            <div className="field-col">
              <label className="field-label" id="task-reminders-label">
                Remind before due <span className="field-optional">(optional)</span>
              </label>
              <div aria-labelledby="task-reminders-label">
                <ReminderOffsetPicker value={reminderOffsets} onToggle={toggleReminderOffset} />
              </div>
            </div>
          )}

          {error && (
            <div role="alert" className="form-error">
              {error}
            </div>
          )}

          <div className="modal-actions">
            <button type="button" className="btn btn-ghost" onClick={requestClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={submitting}>
              {submitting ? 'Saving...' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
    <TaskTemplateFormModal
      open={templateFormOpen}
      onClose={() => setTemplateFormOpen(false)}
      onSaved={handleTemplateSaved}
    />
    <ConfirmDialog
      open={confirmDiscard}
      title="Discard changes?"
      message="You'll lose what you've entered here. This can't be undone."
      confirmLabel="Discard"
      danger
      onConfirm={discardAndClose}
      onCancel={() => setConfirmDiscard(false)}
    />
    </>
  );
}
