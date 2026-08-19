import { Link } from 'react-router-dom';
import type { Profile, TaskWithProfiles } from '../types';
import type { TaskBreakdown } from '../lib/taskBreakdown';
import { formatDueDate, formatDueTime, formatTimestamp } from '../lib/dates';
import { employeeColorSlot, employeeInitials } from '../lib/employeeColors';

interface RosterRow {
  employee: Profile;
  breakdown: TaskBreakdown;
}

interface EmployeeBreakdownModalProps {
  /** null = the combined "All employees" view; a Profile = one employee's own breakdown. */
  employee: Profile | null;
  breakdown: TaskBreakdown | null;
  /** Only passed for the combined view — one row per employee for a quick side-by-side. */
  roster?: RosterRow[];
  employees: Profile[];
  onClose: () => void;
  onSelectTask: (task: TaskWithProfiles) => void;
}

function StatTile({ value, label, warn = false }: { value: number; label: string; warn?: boolean }) {
  return (
    <div className="completion-stat">
      <span className={`completion-value${warn && value > 0 ? ' breakdown-stat-warn' : ''}`}>{value}</span>
      <span className="completion-label">{label}</span>
    </div>
  );
}

function TaskRow({ task, showAssignee }: { task: TaskWithProfiles; showAssignee: boolean }) {
  return (
    <>
      <span className="breakdown-task-title">{task.title}</span>
      <span className="breakdown-task-meta">
        {task.status === 'completed'
          ? task.completed_at
            ? formatTimestamp(task.completed_at)
            : ''
          : formatDueDate(task.due_date)}
        {task.status !== 'completed' && task.due_time ? ` · ${formatDueTime(task.due_time)}` : ''}
        {showAssignee && task.assignee ? ` · ${task.assignee.full_name}` : ''}
      </span>
    </>
  );
}

export default function EmployeeBreakdownModal({
  employee,
  breakdown,
  roster,
  employees,
  onClose,
  onSelectTask,
}: EmployeeBreakdownModalProps) {
  if (!breakdown) return null;

  const title = employee ? employee.full_name : 'All employees';
  const tasksLink = employee ? `/tasks?employee=${employee.id}` : '/tasks';

  return (
    <div className="modal-overlay" role="presentation" onClick={onClose}>
      <div
        className="modal-panel modal-panel-wide"
        role="dialog"
        aria-modal="true"
        aria-labelledby="breakdown-title"
        onClick={(e) => e.stopPropagation()}
      >
        <button type="button" className="modal-close-x" aria-label="Close" onClick={onClose}>
          ×
        </button>

        <div className="breakdown-header">
          {employee && (
            <span className={`employee-badge employee-badge-${employeeColorSlot(employee.id, employees)}`} aria-hidden="true">
              {employeeInitials(employee.full_name)}
            </span>
          )}
          <h2 id="breakdown-title">{title}</h2>
        </div>

        <div className="completion-card-stats breakdown-stats-grid">
          <StatTile value={breakdown.open} label="Open" />
          <StatTile value={breakdown.overdue} label="Overdue" warn />
          <StatTile value={breakdown.dueToday} label="Due today" />
          <StatTile value={breakdown.completion.today} label="Completed today" />
          <StatTile value={breakdown.completion.thisWeek} label="Completed this week" />
          <StatTile value={breakdown.completion.thisMonth} label="Completed this month" />
          <StatTile value={breakdown.completion.allTime} label="Completed all time" />
        </div>

        {roster && roster.length > 0 && (
          <div className="breakdown-section">
            <h3>By employee</h3>
            <div className="breakdown-roster">
              {roster.map((row) => (
                <div className="breakdown-roster-row" key={row.employee.id}>
                  <span
                    className={`employee-badge employee-badge-${employeeColorSlot(row.employee.id, employees)}`}
                    aria-hidden="true"
                  >
                    {employeeInitials(row.employee.full_name)}
                  </span>
                  <span className="breakdown-roster-name">{row.employee.full_name}</span>
                  <span className="breakdown-roster-stat">{row.breakdown.open} open</span>
                  <span className={`breakdown-roster-stat${row.breakdown.overdue > 0 ? ' breakdown-stat-warn' : ''}`}>
                    {row.breakdown.overdue} overdue
                  </span>
                  <span className="breakdown-roster-stat">{row.breakdown.completion.today} done today</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="breakdown-section">
          <h3>
            Open tasks{' '}
            <span className="task-section-count">{breakdown.open}</span>
          </h3>
          {breakdown.openTasks.length === 0 ? (
            <p className="muted">Nothing open.</p>
          ) : (
            <div className="breakdown-task-list">
              {breakdown.openTasks.map((task) => (
                <button
                  type="button"
                  key={task.id}
                  className="breakdown-task-row"
                  onClick={() => {
                    onClose();
                    onSelectTask(task);
                  }}
                >
                  <TaskRow task={task} showAssignee={!employee} />
                </button>
              ))}
              {breakdown.open > breakdown.openTasks.length && (
                <p className="muted breakdown-more-hint">
                  +{breakdown.open - breakdown.openTasks.length} more — see all in Tasks below.
                </p>
              )}
            </div>
          )}
        </div>

        <div className="breakdown-section">
          <h3>Recently completed</h3>
          {breakdown.recentlyCompleted.length === 0 ? (
            <p className="muted">Nothing completed yet.</p>
          ) : (
            <div className="breakdown-task-list">
              {breakdown.recentlyCompleted.map((task) => (
                <button
                  type="button"
                  key={task.id}
                  className="breakdown-task-row"
                  onClick={() => {
                    onClose();
                    onSelectTask(task);
                  }}
                >
                  <TaskRow task={task} showAssignee={!employee} />
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="modal-actions">
          <Link to={tasksLink} className="btn btn-secondary" onClick={onClose}>
            View all in Tasks
          </Link>
          <button type="button" className="btn btn-primary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
