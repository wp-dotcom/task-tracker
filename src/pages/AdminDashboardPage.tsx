import { useMemo, useState } from 'react';
import { useTasks } from '../context/TasksContext';
import { useEmployees } from '../hooks/useEmployees';
import { computeTaskBreakdown } from '../lib/taskBreakdown';
import { employeeColorSlot, employeeInitials } from '../lib/employeeColors';
import { taskDeadline } from '../lib/dates';
import type { TaskBreakdown } from '../lib/taskBreakdown';
import type { Profile, TaskWithProfiles } from '../types';
import DashboardSummary from '../components/DashboardSummary';
import AdminTaskCalendarPanel from '../components/AdminTaskCalendarPanel';
import TaskCard from '../components/TaskCard';
import TaskDetailsModal from '../components/TaskDetailsModal';
import EmployeeBreakdownModal from '../components/EmployeeBreakdownModal';
import { ListSkeleton } from '../components/Skeleton';

// How many soonest-due open tasks to preview above the calendar — enough to
// be useful at a glance without turning the Dashboard into another task list.
const UPCOMING_COUNT = 5;

function CompletionCard({
  name,
  breakdown,
  badge,
  total = false,
  onClick,
}: {
  name: string;
  breakdown: TaskBreakdown;
  badge?: { initials: string; colorSlot: number };
  total?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`completion-card${total ? ' completion-card-total' : ''}`}
      onClick={onClick}
    >
      <div className="completion-card-name">
        {badge && (
          <span className={`employee-badge employee-badge-${badge.colorSlot}`} aria-hidden="true">
            {badge.initials}
          </span>
        )}
        {name}
      </div>
      <div className="completion-card-stats">
        <div className="completion-stat">
          <span className="completion-value">{breakdown.completion.today}</span>
          <span className="completion-label">Today</span>
        </div>
        <div className="completion-stat">
          <span className="completion-value">{breakdown.completion.thisWeek}</span>
          <span className="completion-label">This week</span>
        </div>
        <div className="completion-stat">
          <span className="completion-value">{breakdown.completion.thisMonth}</span>
          <span className="completion-label">This month</span>
        </div>
        <div className="completion-stat">
          <span className="completion-value">{breakdown.completion.allTime}</span>
          <span className="completion-label">All time</span>
        </div>
      </div>
    </button>
  );
}

export default function AdminDashboardPage() {
  const { tasks, loading } = useTasks();
  const { employees, loading: employeesLoading } = useEmployees();
  const [selectedTask, setSelectedTask] = useState<TaskWithProfiles | null>(null);
  // null = closed, 'all' = the combined breakdown, a Profile = one employee's.
  const [breakdownTarget, setBreakdownTarget] = useState<Profile | 'all' | null>(null);

  const teamBreakdown = useMemo(() => computeTaskBreakdown(tasks), [tasks]);
  const perEmployeeBreakdown = useMemo(() => {
    const map = new Map<string, TaskBreakdown>();
    for (const emp of employees) {
      map.set(emp.id, computeTaskBreakdown(tasks.filter((t) => t.assigned_to === emp.id)));
    }
    return map;
  }, [tasks, employees]);

  const upcomingTasks = useMemo(
    () =>
      [...tasks]
        .filter((t) => t.status === 'open')
        .sort((a, b) => taskDeadline(a).getTime() - taskDeadline(b).getTime())
        .slice(0, UPCOMING_COUNT),
    [tasks],
  );

  const roster = useMemo(
    () =>
      employees.map((emp) => ({
        employee: emp,
        breakdown: perEmployeeBreakdown.get(emp.id) ?? computeTaskBreakdown([]),
      })),
    [employees, perEmployeeBreakdown],
  );

  const activeBreakdown =
    breakdownTarget === 'all' ? teamBreakdown : breakdownTarget ? perEmployeeBreakdown.get(breakdownTarget.id) ?? null : null;

  return (
    <div className="page">
      <div className="page-header">
        <h1>Dashboard</h1>
      </div>

      {loading ? (
        <ListSkeleton rows={3} />
      ) : (
        <>
          <DashboardSummary tasks={tasks} />

          <section className="dashboard-section">
            <h2 className="dashboard-section-title">Completed tasks</h2>
            <p className="muted dashboard-section-hint">
              How many tasks have been marked complete, together and by employee. Click a card for a full
              breakdown.
            </p>
            {employeesLoading ? (
              <ListSkeleton rows={2} />
            ) : (
              <div className="completion-grid">
                <CompletionCard
                  name="All employees"
                  breakdown={teamBreakdown}
                  total
                  onClick={() => setBreakdownTarget('all')}
                />
                {employees.map((emp) => (
                  <CompletionCard
                    key={emp.id}
                    name={emp.full_name}
                    breakdown={perEmployeeBreakdown.get(emp.id) ?? computeTaskBreakdown([])}
                    badge={{ initials: employeeInitials(emp.full_name), colorSlot: employeeColorSlot(emp.id, employees) }}
                    onClick={() => setBreakdownTarget(emp)}
                  />
                ))}
              </div>
            )}
          </section>

          <section className="dashboard-section">
            <h2 className="dashboard-section-title">Upcoming</h2>
            {upcomingTasks.length === 0 ? (
              <p className="muted dashboard-section-hint">Nothing open right now.</p>
            ) : (
              <div className="task-list">
                {upcomingTasks.map((task) => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    onClick={() => setSelectedTask(task)}
                    showAssignee
                    assigneeColorSlot={task.assignee ? employeeColorSlot(task.assignee.id, employees) : 0}
                  />
                ))}
              </div>
            )}
          </section>

          <section className="dashboard-section">
            <h2 className="dashboard-section-title">Calendar</h2>
            <AdminTaskCalendarPanel />
          </section>
        </>
      )}

      <TaskDetailsModal task={selectedTask} onClose={() => setSelectedTask(null)} />

      <EmployeeBreakdownModal
        employee={breakdownTarget === 'all' || breakdownTarget === null ? null : breakdownTarget}
        breakdown={activeBreakdown}
        roster={breakdownTarget === 'all' ? roster : undefined}
        employees={employees}
        onClose={() => setBreakdownTarget(null)}
        onSelectTask={setSelectedTask}
      />
    </div>
  );
}
