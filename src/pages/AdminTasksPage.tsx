import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTasks } from '../context/TasksContext';
import { useEmployees } from '../hooks/useEmployees';
import { filterTasks } from '../lib/filterTasks';
import type { TaskListFilter, TaskWithProfiles } from '../types';
import TaskCard from '../components/TaskCard';
import TaskFilterBar from '../components/TaskFilterBar';
import TaskDetailsModal from '../components/TaskDetailsModal';
import TaskFormModal from '../components/TaskFormModal';
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
  const { tasks, loading, error } = useTasks();
  const { employees } = useEmployees();
  const [searchParams, setSearchParams] = useSearchParams();

  const urlFilter = searchParams.get('filter');
  const [filter, setFilterState] = useState<TaskListFilter>(
    isTaskListFilter(urlFilter) ? urlFilter : 'all',
  );
  const [employeeId, setEmployeeId] = useState<string | 'all'>('all');
  const [search, setSearch] = useState('');
  const [selectedTask, setSelectedTask] = useState<TaskWithProfiles | null>(null);
  const [formOpen, setFormOpen] = useState(false);

  // Keep the filter in sync when navigated here with a new ?filter=... (e.g.
  // clicking a different dashboard summary tile while already on this page).
  useEffect(() => {
    if (isTaskListFilter(urlFilter)) {
      setFilterState(urlFilter);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlFilter]);

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

  const visibleTasks = useMemo(
    () => filterTasks(tasks, { filter, employeeId, search }),
    [tasks, filter, employeeId, search],
  );

  return (
    <div className="page">
      <div className="page-header">
        <h1>Tasks</h1>
        <button type="button" className="btn btn-primary" onClick={() => setFormOpen(true)}>
          + Add Task
        </button>
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
        </div>
      ) : (
        <div className="task-list">
          {visibleTasks.map((task) => (
            <TaskCard key={task.id} task={task} onClick={() => setSelectedTask(task)} showAssignee />
          ))}
        </div>
      )}

      <TaskFormModal open={formOpen} onClose={() => setFormOpen(false)} />
      <TaskDetailsModal task={selectedTask} onClose={() => setSelectedTask(null)} />
    </div>
  );
}
