import { useMemo, useState } from 'react';
import { useTasks } from '../context/TasksContext';
import type { TaskWithProfiles } from '../types';
import { isTaskDueToday, isTaskOverdue, isWithinCurrentWeek, todayLocalISODate } from '../lib/dates';
import { urgencyWeight } from '../lib/urgency';
import TaskCard from '../components/TaskCard';
import TaskDetailsModal from '../components/TaskDetailsModal';
import TaskFormModal from '../components/TaskFormModal';
import { ListSkeleton } from '../components/Skeleton';

function byUrgencyThenDate(a: TaskWithProfiles, b: TaskWithProfiles) {
  const w = urgencyWeight(a.urgency) - urgencyWeight(b.urgency);
  if (w !== 0) return w;
  return a.due_date.localeCompare(b.due_date);
}

function matchesSearch(task: TaskWithProfiles, searchLower: string): boolean {
  if (!searchLower) return true;
  return `${task.title} ${task.description}`.toLowerCase().includes(searchLower);
}

export default function EmployeeMyTasksPage() {
  const { tasks, loading, error } = useTasks();
  const [selectedTask, setSelectedTask] = useState<TaskWithProfiles | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [search, setSearch] = useState('');

  const unviewedCount = useMemo(
    () => tasks.filter((t) => t.status === 'open' && !t.first_viewed_at).length,
    [tasks],
  );

  const groups = useMemo(() => {
    const open = tasks.filter((t) => t.status === 'open');
    const overdue = open.filter((t) => isTaskOverdue(t)).sort(byUrgencyThenDate);
    const today = open
      .filter((t) => isTaskDueToday(t) && !isTaskOverdue(t))
      .sort(byUrgencyThenDate);
    const upcoming = open.filter((t) => !isTaskDueToday(t) && !isTaskOverdue(t));
    const sortByDate = (a: TaskWithProfiles, b: TaskWithProfiles) =>
      a.due_date.localeCompare(b.due_date) || byUrgencyThenDate(a, b);
    // Split "upcoming" so the rest of this week (Sun-Sat) is visually
    // separated from tasks further out, which matter less right now.
    const thisWeek = upcoming.filter((t) => isWithinCurrentWeek(t.due_date)).sort(sortByDate);
    const future = upcoming.filter((t) => !isWithinCurrentWeek(t.due_date)).sort(sortByDate);
    const completed = tasks
      .filter((t) => t.status === 'completed')
      .sort((a, b) => (b.completed_at ?? '').localeCompare(a.completed_at ?? ''));

    return { overdue, today, thisWeek, future, completed };
  }, [tasks]);

  // Stats always reflect the real, unfiltered counts — search only narrows
  // which cards show up below, the same way it works on the admin Tasks page.
  const stats = useMemo(() => {
    const todayStr = todayLocalISODate();
    const completedToday = groups.completed.filter((t) => t.completed_at?.slice(0, 10) === todayStr).length;
    return {
      dueToday: groups.today.length,
      overdue: groups.overdue.length,
      thisWeek: groups.thisWeek.length,
      completedToday,
    };
  }, [groups]);

  const searchLower = search.trim().toLowerCase();
  const displayGroups = useMemo(
    () => ({
      overdue: groups.overdue.filter((t) => matchesSearch(t, searchLower)),
      today: groups.today.filter((t) => matchesSearch(t, searchLower)),
      thisWeek: groups.thisWeek.filter((t) => matchesSearch(t, searchLower)),
      future: groups.future.filter((t) => matchesSearch(t, searchLower)),
      completed: groups.completed.filter((t) => matchesSearch(t, searchLower)),
    }),
    [groups, searchLower],
  );

  const nothingDue =
    groups.overdue.length === 0 &&
    groups.today.length === 0 &&
    groups.thisWeek.length === 0 &&
    groups.future.length === 0;

  const totalMatches =
    displayGroups.overdue.length +
    displayGroups.today.length +
    displayGroups.thisWeek.length +
    displayGroups.future.length +
    displayGroups.completed.length;
  const noSearchResults = searchLower !== '' && totalMatches === 0;

  return (
    <div className="page employee-page">
      <div className="page-header">
        <h1>My Tasks</h1>
        <button type="button" className="btn btn-primary" onClick={() => setFormOpen(true)}>
          + Add Task
        </button>
      </div>

      {!loading && (
        <div className="dashboard-summary">
          <a href="#my-tasks-today" className="summary-stat summary-stat-link">
            <span className="summary-value">{stats.dueToday}</span>
            <span className="summary-label">Due today</span>
          </a>
          <a href="#my-tasks-overdue" className="summary-stat summary-stat-warn summary-stat-link">
            <span className="summary-value">{stats.overdue}</span>
            <span className="summary-label">Overdue</span>
          </a>
          <a href="#my-tasks-week" className="summary-stat summary-stat-link">
            <span className="summary-value">{stats.thisWeek}</span>
            <span className="summary-label">This week</span>
          </a>
          <a href="#my-tasks-completed" className="summary-stat summary-stat-good summary-stat-link">
            <span className="summary-value">{stats.completedToday}</span>
            <span className="summary-label">Completed today</span>
          </a>
        </div>
      )}

      {!loading && unviewedCount > 0 && (
        <div className="new-tasks-banner" role="status">
          <span className="new-tasks-banner-icon" aria-hidden="true">
            🆕
          </span>
          <span>
            You have <strong>{unviewedCount}</strong> new task{unviewedCount === 1 ? '' : 's'} you
            haven't looked at yet — {unviewedCount === 1 ? "it's" : "they're"} marked{' '}
            <span className="new-pill new-pill-inline">New</span> below.
          </span>
        </div>
      )}

      {error && (
        <div role="alert" className="form-error">
          {error}
        </div>
      )}

      {!loading && (tasks.length > 0 || search) && (
        <input
          type="search"
          className="field-input my-tasks-search"
          placeholder="Search your tasks..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search your tasks"
        />
      )}

      {loading ? (
        <ListSkeleton rows={4} />
      ) : noSearchResults ? (
        <div className="empty-state">
          <p>No tasks match “{search.trim()}”.</p>
          <button type="button" className="btn btn-secondary" onClick={() => setSearch('')}>
            Clear search
          </button>
        </div>
      ) : (
        <>
          {nothingDue && (
            <div className="empty-state empty-state-happy">
              <p>You're all caught up.</p>
            </div>
          )}

          {displayGroups.overdue.length > 0 && (
            <TaskSection
              id="my-tasks-overdue"
              title="Overdue"
              tasks={displayGroups.overdue}
              onSelect={setSelectedTask}
            />
          )}

          {displayGroups.today.length > 0 && (
            <TaskSection
              id="my-tasks-today"
              title="Today"
              tasks={displayGroups.today}
              onSelect={setSelectedTask}
            />
          )}

          {displayGroups.thisWeek.length > 0 && (
            <TaskSection
              id="my-tasks-week"
              title="This Week"
              tasks={displayGroups.thisWeek}
              onSelect={setSelectedTask}
            />
          )}

          {displayGroups.future.length > 0 && (
            <TaskSection title="Future" tasks={displayGroups.future} onSelect={setSelectedTask} />
          )}

          {displayGroups.completed.length > 0 && (
            <TaskSection
              id="my-tasks-completed"
              title="Completed"
              tasks={displayGroups.completed}
              onSelect={setSelectedTask}
              muted
            />
          )}
        </>
      )}

      <TaskDetailsModal task={selectedTask} onClose={() => setSelectedTask(null)} />
      <TaskFormModal open={formOpen} onClose={() => setFormOpen(false)} />
    </div>
  );
}

function TaskSection({
  id,
  title,
  tasks,
  onSelect,
  muted = false,
}: {
  id?: string;
  title: string;
  tasks: TaskWithProfiles[];
  onSelect: (task: TaskWithProfiles) => void;
  muted?: boolean;
}) {
  return (
    <section id={id} className={`task-section${muted ? ' task-section-muted' : ''}`}>
      <h2 className="task-section-title">
        {title} <span className="task-section-count">{tasks.length}</span>
      </h2>
      <div className="task-list">
        {tasks.map((task) => (
          <TaskCard key={task.id} task={task} onClick={() => onSelect(task)} />
        ))}
      </div>
    </section>
  );
}
