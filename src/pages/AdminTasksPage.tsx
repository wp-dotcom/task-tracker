import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTasks } from '../context/TasksContext';
import { useToast } from '../context/ToastContext';
import { useEmployees } from '../hooks/useEmployees';
import { filterTasks } from '../lib/filterTasks';
import { getErrorMessage } from '../lib/errors';
import { playCompletionSound } from '../lib/completionEffects';
import { isTaskDueToday, isTaskOverdue } from '../lib/dates';
import { buildDayBuckets, buildFutureWeekBuckets, byUrgencyThenDate } from '../lib/taskGrouping';
import { employeeColorSlot } from '../lib/employeeColors';
import type { Profile, TaskListFilter, TaskWithProfiles } from '../types';
import TaskCard from '../components/TaskCard';
import TaskFilterBar from '../components/TaskFilterBar';
import TaskDetailsModal from '../components/TaskDetailsModal';
import TaskFormModal from '../components/TaskFormModal';
import ConfirmDialog from '../components/ConfirmDialog';
import Dropdown from '../components/Dropdown';
import { ListSkeleton } from '../components/Skeleton';

const VALID_FILTERS: TaskListFilter[] = [
  'all',
  'open',
  'completed',
  'overdue',
  'not_viewed',
  'viewed',
  'urgent',
  'due_today',
  'completed_today',
];

function isTaskListFilter(value: string | null): value is TaskListFilter {
  return value !== null && (VALID_FILTERS as string[]).includes(value);
}

export default function AdminTasksPage() {
  const { tasks, loading, error, completeTask, deleteTask, updateTask } = useTasks();
  const { showToast } = useToast();
  const { employees } = useEmployees();
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);

  const urlFilter = searchParams.get('filter');
  const urlEmployee = searchParams.get('employee');
  const [filter, setFilterState] = useState<TaskListFilter>(
    isTaskListFilter(urlFilter) ? urlFilter : 'all',
  );
  const [employeeId, setEmployeeIdState] = useState<string | 'all'>(urlEmployee ?? 'all');
  const [search, setSearch] = useState('');
  const [selectedTask, setSelectedTask] = useState<TaskWithProfiles | null>(null);
  const [formOpen, setFormOpen] = useState(false);

  // Keep the filter/employee in sync when navigated here with new
  // ?filter=...&employee=... params (e.g. clicking a dashboard tile or an
  // employee's stat on the Employees page while already on this page).
  useEffect(() => {
    if (isTaskListFilter(urlFilter)) {
      setFilterState(urlFilter);
    }
    setEmployeeIdState(urlEmployee ?? 'all');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlFilter, urlEmployee]);

  function setFilter(next: TaskListFilter) {
    setFilterState(next);
    setSearchParams((prev) => {
      const params = new URLSearchParams(prev);
      if (next === 'all') {
        params.delete('filter');
      } else {
        params.set('filter', next);
      }
      return params;
    });
  }

  function setEmployeeId(next: string | 'all') {
    setEmployeeIdState(next);
    setSearchParams((prev) => {
      const params = new URLSearchParams(prev);
      if (next === 'all') {
        params.delete('employee');
      } else {
        params.set('employee', next);
      }
      return params;
    });
  }

  function clearFilters() {
    setFilter('all');
    setEmployeeId('all');
    setSearch('');
  }

  const visibleTasks = useMemo(
    () => filterTasks(tasks, { filter, employeeId, search }),
    [tasks, filter, employeeId, search],
  );

  // Same Overdue / Today / (rest-of-week day-by-day) / Next 3 weeks grouping
  // as the employee My Tasks page, applied to whatever visibleTasks already
  // came out of the filter bar above (so the status/employee/search filters
  // still narrow things exactly as before — this only changes how the
  // result is grouped, not which tasks show up). Unlike the employee page,
  // nothing here is capped to that rolling 3-week window and quietly
  // dropped — an admin needs to see everything, so anything further out
  // lands in a catch-all "Later" section instead of disappearing.
  const groupedTasks = useMemo(() => {
    const open = visibleTasks.filter((t) => t.status === 'open');
    const overdue = open.filter((t) => isTaskOverdue(t)).sort(byUrgencyThenDate);
    const today = open.filter((t) => isTaskDueToday(t) && !isTaskOverdue(t)).sort(byUrgencyThenDate);
    const upcoming = open.filter((t) => !isTaskDueToday(t) && !isTaskOverdue(t));

    const days = buildDayBuckets(upcoming);
    const futureWeeks = buildFutureWeekBuckets(upcoming);

    const bucketed = new Set([...days.flatMap((d) => d.tasks), ...futureWeeks.flatMap((w) => w.tasks)].map(
      (t) => t.id,
    ));
    const later = upcoming
      .filter((t) => !bucketed.has(t.id))
      .sort((a, b) => a.due_date.localeCompare(b.due_date) || byUrgencyThenDate(a, b));

    const completed = visibleTasks
      .filter((t) => t.status === 'completed')
      .sort((a, b) => (b.completed_at ?? '').localeCompare(a.completed_at ?? ''));

    return { overdue, today, days, futureWeeks, later, completed };
  }, [visibleTasks]);

  const filtersActive = filter !== 'all' || employeeId !== 'all' || search.trim() !== '';

  function toggleSelectMode() {
    setSelectMode((on) => !on);
    setSelectedIds(new Set());
    setBulkError(null);
  }

  function toggleSelected(taskId: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) {
        next.delete(taskId);
      } else {
        next.add(taskId);
      }
      return next;
    });
  }

  function clearSelection() {
    setSelectedIds(new Set());
  }

  async function handleBulkComplete() {
    setBulkBusy(true);
    setBulkError(null);
    const ids = Array.from(selectedIds);
    try {
      await Promise.all(ids.map((id) => completeTask(id)));
      // One chime for the whole batch, not one per task — N overlapping
      // copies of the same sound would be noise, not a celebration. No
      // burst animation here either, since there's no single card to
      // anchor it to once several rows disappear from the list at once.
      playCompletionSound();
      showToast(`${ids.length} task${ids.length === 1 ? '' : 's'} marked complete`);
      clearSelection();
    } catch (err) {
      setBulkError(getErrorMessage(err));
    } finally {
      setBulkBusy(false);
    }
  }

  async function handleBulkReassign(newEmployeeId: string) {
    if (!newEmployeeId) return;
    setBulkBusy(true);
    setBulkError(null);
    const ids = Array.from(selectedIds);
    try {
      await Promise.all(ids.map((id) => updateTask(id, { assigned_to: newEmployeeId })));
      const name = employees.find((e) => e.id === newEmployeeId)?.full_name ?? 'employee';
      showToast(`${ids.length} task${ids.length === 1 ? '' : 's'} reassigned to ${name}`);
      clearSelection();
    } catch (err) {
      setBulkError(getErrorMessage(err));
    } finally {
      setBulkBusy(false);
    }
  }

  async function handleBulkDelete() {
    setBulkBusy(true);
    setBulkError(null);
    const ids = Array.from(selectedIds);
    try {
      await Promise.all(ids.map((id) => deleteTask(id)));
      showToast(`${ids.length} task${ids.length === 1 ? '' : 's'} deleted`);
      clearSelection();
      setConfirmBulkDelete(false);
    } catch (err) {
      setBulkError(getErrorMessage(err));
    } finally {
      setBulkBusy(false);
    }
  }

  return (
    <div className="page">
      <div className="page-header">
        <h1>Tasks</h1>
        <div className="page-header-actions">
          <button type="button" className="btn btn-secondary" onClick={toggleSelectMode}>
            {selectMode ? 'Cancel' : 'Select'}
          </button>
          <button type="button" className="btn btn-primary" onClick={() => setFormOpen(true)}>
            + Add Task
          </button>
        </div>
      </div>

      <TaskFilterBar
        filter={filter}
        onFilterChange={setFilter}
        employees={employees}
        employeeId={employeeId}
        onEmployeeChange={setEmployeeId}
        search={search}
        onSearchChange={setSearch}
      />

      {error && (
        <div role="alert" className="form-error">
          {error}
        </div>
      )}

      {loading ? (
        <ListSkeleton rows={5} />
      ) : visibleTasks.length === 0 ? (
        <div className="empty-state">
          <p>No tasks match these filters.</p>
          {filtersActive && (
            <button type="button" className="btn btn-secondary" onClick={clearFilters}>
              Clear filters
            </button>
          )}
        </div>
      ) : (
        <>
          {groupedTasks.overdue.length > 0 && (
            <AdminTaskSection
              title="Overdue"
              tasks={groupedTasks.overdue}
              onSelect={setSelectedTask}
              selectMode={selectMode}
              selectedIds={selectedIds}
              onToggleSelect={toggleSelected}
              employees={employees}
            />
          )}

          {groupedTasks.today.length > 0 && (
            <AdminTaskSection
              title="Today"
              tasks={groupedTasks.today}
              onSelect={setSelectedTask}
              selectMode={selectMode}
              selectedIds={selectedIds}
              onToggleSelect={toggleSelected}
              employees={employees}
            />
          )}

          {groupedTasks.days.some((d) => d.tasks.length > 0) && (
            <div className="task-week-group">
              {groupedTasks.days
                .filter((d) => d.tasks.length > 0)
                .map((d) => (
                  <AdminTaskSection
                    key={d.dateStr}
                    title={d.label}
                    tasks={d.tasks}
                    onSelect={setSelectedTask}
                    selectMode={selectMode}
                    selectedIds={selectedIds}
                    onToggleSelect={toggleSelected}
                    employees={employees}
                  />
                ))}
            </div>
          )}

          {groupedTasks.futureWeeks
            .filter((w) => w.tasks.length > 0)
            .map((w) => (
              <AdminTaskSection
                key={w.key}
                title={w.label}
                tasks={w.tasks}
                onSelect={setSelectedTask}
                selectMode={selectMode}
                selectedIds={selectedIds}
                onToggleSelect={toggleSelected}
                employees={employees}
              />
            ))}

          {groupedTasks.later.length > 0 && (
            <AdminTaskSection
              title="Later"
              tasks={groupedTasks.later}
              onSelect={setSelectedTask}
              selectMode={selectMode}
              selectedIds={selectedIds}
              onToggleSelect={toggleSelected}
              employees={employees}
            />
          )}

          {groupedTasks.completed.length > 0 && (
            <AdminTaskSection
              title="Completed"
              tasks={groupedTasks.completed}
              onSelect={setSelectedTask}
              selectMode={selectMode}
              selectedIds={selectedIds}
              onToggleSelect={toggleSelected}
              employees={employees}
              muted
            />
          )}
        </>
      )}

      <TaskFormModal open={formOpen} onClose={() => setFormOpen(false)} />
      <TaskDetailsModal task={selectedTask} onClose={() => setSelectedTask(null)} />

      {selectMode && selectedIds.size > 0 && (
        <div className="bulk-action-bar" role="toolbar" aria-label="Bulk task actions">
          <span className="bulk-action-count">
            {selectedIds.size} selected
          </span>
          {bulkError && (
            <span role="alert" className="bulk-action-error">
              {bulkError}
            </span>
          )}
          <div className="bulk-action-buttons">
            <button
              type="button"
              className="btn btn-success"
              onClick={handleBulkComplete}
              disabled={bulkBusy}
            >
              Complete
            </button>
            <Dropdown
              className="bulk-action-reassign"
              value=""
              disabled={bulkBusy || employees.length === 0}
              onChange={handleBulkReassign}
              options={employees.map((emp) => ({ value: emp.id, label: emp.full_name }))}
              placeholder="Reassign to..."
              aria-label="Reassign selected tasks to"
            />
            <button
              type="button"
              className="btn btn-danger"
              onClick={() => setConfirmBulkDelete(true)}
              disabled={bulkBusy}
            >
              Delete
            </button>
            <button type="button" className="btn btn-ghost" onClick={clearSelection} disabled={bulkBusy}>
              Clear
            </button>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmBulkDelete}
        title={`Delete ${selectedIds.size} task${selectedIds.size === 1 ? '' : 's'}?`}
        message="These tasks will be permanently deleted. This cannot be undone."
        confirmLabel={bulkBusy ? 'Deleting...' : 'Delete'}
        danger
        busy={bulkBusy}
        onConfirm={handleBulkDelete}
        onCancel={() => setConfirmBulkDelete(false)}
      />
    </div>
  );
}

/** Same section shape as the employee My Tasks page's TaskSection, plus the bulk-select props this page needs. */
function AdminTaskSection({
  title,
  tasks,
  onSelect,
  selectMode,
  selectedIds,
  onToggleSelect,
  employees,
  muted = false,
}: {
  title: string;
  tasks: TaskWithProfiles[];
  onSelect: (task: TaskWithProfiles) => void;
  selectMode: boolean;
  selectedIds: Set<string>;
  onToggleSelect: (taskId: string) => void;
  employees: Profile[];
  muted?: boolean;
}) {
  return (
    <section className={`task-section${muted ? ' task-section-muted' : ''}`}>
      <h2 className="task-section-title">
        {title} <span className="task-section-count">{tasks.length}</span>
      </h2>
      <div className="task-list">
        {tasks.map((task) => (
          <TaskCard
            key={task.id}
            task={task}
            onClick={() => onSelect(task)}
            showAssignee
            assigneeColorSlot={employeeColorSlot(task.assigned_to, employees)}
            selectable={selectMode}
            selected={selectedIds.has(task.id)}
            onToggleSelect={() => onToggleSelect(task.id)}
          />
        ))}
      </div>
    </section>
  );
}
