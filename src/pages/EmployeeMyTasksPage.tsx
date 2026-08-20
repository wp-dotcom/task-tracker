import { useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useTasks } from '../context/TasksContext';
import { useEmployees } from '../hooks/useEmployees';
import type { Profile, TaskWithProfiles } from '../types';
import { isTaskDueToday, isTaskOverdue, taskDeadline, todayLocalISODate } from '../lib/dates';
import { buildDayBuckets, buildFutureWeekBuckets, byUrgencyThenDate } from '../lib/taskGrouping';
import { employeeColorSlot } from '../lib/employeeColors';
import TaskCard from '../components/TaskCard';
import TaskDetailsModal from '../components/TaskDetailsModal';
import TaskFormModal from '../components/TaskFormModal';
import { ListSkeleton } from '../components/Skeleton';

function matchesSearch(task: TaskWithProfiles, searchLower: string): boolean {
  if (!searchLower) return true;
  return `${task.title} ${task.description}`.toLowerCase().includes(searchLower);
}

export default function EmployeeMyTasksPage() {
  const { profile } = useAuth();
  const { tasks, loading, error } = useTasks();
  const { employees } = useEmployees();
  const [selectedTask, setSelectedTask] = useState<TaskWithProfiles | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [search, setSearch] = useState('');

  // "My Tasks" means tasks assigned TO me — tasks I created and tagged a
  // coworker (or the admin) on instead are tracked separately below, in
  // "Assigned by you", since they aren't this employee's to do. Without this
  // filter, everything here would be a mix of "things I need to do" and
  // "things I asked someone else to do", which is confusing at a glance.
  const myTasks = useMemo(() => tasks.filter((t) => t.assigned_to === profile?.id), [tasks, profile?.id]);
  const delegatedTasks = useMemo(
    () => tasks.filter((t) => t.created_by === profile?.id && t.assigned_to !== profile?.id),
    [tasks, profile?.id],
  );

  const unviewedCount = useMemo(
    () => myTasks.filter((t) => t.status === 'open' && !t.first_viewed_at).length,
    [myTasks],
  );

  const groups = useMemo(() => {
    const open = myTasks.filter((t) => t.status === 'open');
    const overdue = open.filter((t) => isTaskOverdue(t)).sort(byUrgencyThenDate);
    const today = open
      .filter((t) => isTaskDueToday(t) && !isTaskOverdue(t))
      .sort(byUrgencyThenDate);
    const upcoming = open.filter((t) => !isTaskDueToday(t) && !isTaskOverdue(t));

    // Rest of this week (tomorrow through Saturday), one section per day —
    // and the next 3 full weeks after that, one section per week. Anything
    // due later than that isn't shown here at all; it'll still show up once
    // it falls inside that window on a later visit, or on the Calendar.
    const days = buildDayBuckets(upcoming);
    const futureWeeks = buildFutureWeekBuckets(upcoming);

    const completed = myTasks
      .filter((t) => t.status === 'completed')
      .sort((a, b) => (b.completed_at ?? '').localeCompare(a.completed_at ?? ''));

    return { overdue, today, days, futureWeeks, completed };
  }, [myTasks]);

  // Open first (soonest due date), then completed (most recently finished) —
  // same shape as the rest of this page, just flattened into one section
  // since there's usually only a handful of these.
  const delegatedGroups = useMemo(() => {
    const open = [...delegatedTasks.filter((t) => t.status === 'open')].sort(
      (a, b) => taskDeadline(a).getTime() - taskDeadline(b).getTime(),
    );
    const completed = [...delegatedTasks.filter((t) => t.status === 'completed')].sort((a, b) =>
      (b.completed_at ?? '').localeCompare(a.completed_at ?? ''),
    );
    return { open, completed };
  }, [delegatedTasks]);

  // Stats always reflect the real, unfiltered counts — search only narrows
  // which cards show up below, the same way it works on the admin Tasks page.
  const stats = useMemo(() => {
    const todayStr = todayLocalISODate();
    const completedToday = groups.completed.filter((t) => t.completed_at?.slice(0, 10) === todayStr).length;
    const thisWeek = groups.days.reduce((sum, d) => sum + d.tasks.length, 0);
    return {
      dueToday: groups.today.length,
      overdue: groups.overdue.length,
      thisWeek,
      completedToday,
    };
  }, [groups]);

  const searchLower = search.trim().toLowerCase();
  const displayGroups = useMemo(
    () => ({
      overdue: groups.overdue.filter((t) => matchesSearch(t, searchLower)),
      today: groups.today.filter((t) => matchesSearch(t, searchLower)),
      days: groups.days.map((d) => ({ ...d, tasks: d.tasks.filter((t) => matchesSearch(t, searchLower)) })),
      futureWeeks: groups.futureWeeks.map((w) => ({
        ...w,
        tasks: w.tasks.filter((t) => matchesSearch(t, searchLower)),
      })),
      completed: groups.completed.filter((t) => matchesSearch(t, searchLower)),
    }),
    [groups, searchLower],
  );
  const displayDelegated = useMemo(
    () => ({
      open: delegatedGroups.open.filter((t) => matchesSearch(t, searchLower)),
      completed: delegatedGroups.completed.filter((t) => matchesSearch(t, searchLower)),
    }),
    [delegatedGroups, searchLower],
  );

  const nothingDue =
    groups.overdue.length === 0 &&
    groups.today.length === 0 &&
    groups.days.every((d) => d.tasks.length === 0) &&
    groups.futureWeeks.every((w) => w.tasks.length === 0);

  const totalMatches =
    displayGroups.overdue.length +
    displayGroups.today.length +
    displayGroups.days.reduce((sum, d) => sum + d.tasks.length, 0) +
    displayGroups.futureWeeks.reduce((sum, w) => sum + w.tasks.length, 0) +
    displayGroups.completed.length +
    displayDelegated.open.length +
    displayDelegated.completed.length;
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

      {!loading && (myTasks.length > 0 || delegatedTasks.length > 0 || search) && (
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

          {displayGroups.days.some((d) => d.tasks.length > 0) && (
            <div id="my-tasks-week" className="task-week-group">
              {displayGroups.days
                .filter((d) => d.tasks.length > 0)
                .map((d) => (
                  <TaskSection key={d.dateStr} title={d.label} tasks={d.tasks} onSelect={setSelectedTask} />
                ))}
            </div>
          )}

          {displayGroups.futureWeeks
            .filter((w) => w.tasks.length > 0)
            .map((w) => (
              <TaskSection key={w.key} title={w.label} tasks={w.tasks} onSelect={setSelectedTask} />
            ))}

          {displayGroups.completed.length > 0 && (
            <TaskSection
              id="my-tasks-completed"
              title="Completed"
              tasks={displayGroups.completed}
              onSelect={setSelectedTask}
              muted
            />
          )}

          {displayDelegated.open.length > 0 && (
            <TaskSection
              id="my-tasks-assigned-by-you"
              title="Assigned by you"
              tasks={displayDelegated.open}
              onSelect={setSelectedTask}
              showAssignee
              employees={employees}
            />
          )}

          {displayDelegated.completed.length > 0 && (
            <TaskSection
              title="Assigned by you · Completed"
              tasks={displayDelegated.completed}
              onSelect={setSelectedTask}
              showAssignee
              employees={employees}
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
  showAssignee = false,
  employees = [],
}: {
  id?: string;
  title: string;
  tasks: TaskWithProfiles[];
  onSelect: (task: TaskWithProfiles) => void;
  muted?: boolean;
  /** Shows who each task is assigned to — used for the "Assigned by you"
   * sections, where (unlike the rest of this page) that isn't always this
   * employee. */
  showAssignee?: boolean;
  employees?: Profile[];
}) {
  return (
    <section id={id} className={`task-section${muted ? ' task-section-muted' : ''}`}>
      <h2 className="task-section-title">
        {title} <span className="task-section-count">{tasks.length}</span>
      </h2>
      <div className="task-list">
        {tasks.map((task) => (
          <TaskCard
            key={task.id}
            task={task}
            onClick={() => onSelect(task)}
            showAssignee={showAssignee}
            assigneeColorSlot={
              showAssignee && task.assignee ? employeeColorSlot(task.assignee.id, employees) : undefined
            }
          />
        ))}
      </div>
    </section>
  );
}
