import { useMemo, useState } from 'react';
import { useTasks } from '../context/TasksContext';
import type { TaskWithProfiles } from '../types';
import { isTaskDueToday, isTaskOverdue, isWithinCurrentWeek } from '../lib/dates';
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

export default function EmployeeMyTasksPage() {
  const { tasks, loading, error } = useTasks();
  const [selectedTask, setSelectedTask] = useState<TaskWithProfiles | null>(null);
  const [formOpen, setFormOpen] = useState(false);

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

  const nothingDue =
    groups.overdue.length === 0 &&
    groups.today.length === 0 &&
    groups.thisWeek.length === 0 &&
    groups.future.length === 0;

  return (
    <div className="page employee-page">
      <div className="page-header">
        <h1>My Tasks</h1>
        <button type="button" className="btn btn-primary" onClick={() => setFormOpen(true)}>
          + Add Task
        </button>
      </div>

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

      {loading ? (
        <ListSkeleton rows={4} />
      ) : (
        <>
          {nothingDue && (
            <div className="empty-state empty-state-happy">
              <p>You're all caught up.</p>
            </div>
          )}

          {groups.overdue.length > 0 && (
            <TaskSection title="Overdue" tasks={groups.overdue} onSelect={setSelectedTask} />
          )}

          {groups.today.length > 0 && (
            <TaskSection title="Today" tasks={groups.today} onSelect={setSelectedTask} />
          )}

          {groups.thisWeek.length > 0 && (
            <TaskSection title="This Week" tasks={groups.thisWeek} onSelect={setSelectedTask} />
          )}

          {groups.future.length > 0 && (
            <TaskSection title="Future" tasks={groups.future} onSelect={setSelectedTask} />
          )}

          {groups.completed.length > 0 && (
            <TaskSection title="Completed" tasks={groups.completed} onSelect={setSelectedTask} muted />
          )}
        </>
      )}

      <TaskDetailsModal task={selectedTask} onClose={() => setSelectedTask(null)} />
      <TaskFormModal open={formOpen} onClose={() => setFormOpen(false)} />
    </div>
  );
}

function TaskSection({
  title,
  tasks,
  onSelect,
  muted = false,
}: {
  title: string;
  tasks: TaskWithProfiles[];
  onSelect: (task: TaskWithProfiles) => void;
  muted?: boolean;
}) {
  return (
    <section className={`task-section${muted ? ' task-section-muted' : ''}`}>
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
