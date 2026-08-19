import { useMemo } from 'react';
import { useTasks } from '../context/TasksContext';
import { useEmployees } from '../hooks/useEmployees';
import { computeCompletionCounts, computeCompletionCountsByEmployee } from '../lib/completionStats';
import { employeeColorSlot, employeeInitials } from '../lib/employeeColors';
import type { CompletionCounts } from '../lib/completionStats';
import DashboardSummary from '../components/DashboardSummary';
import AdminTaskCalendarPanel from '../components/AdminTaskCalendarPanel';
import { ListSkeleton } from '../components/Skeleton';

function CompletionCard({
  name,
  counts,
  badge,
  total = false,
}: {
  name: string;
  counts: CompletionCounts;
  badge?: { initials: string; colorSlot: number };
  total?: boolean;
}) {
  return (
    <div className={`completion-card${total ? ' completion-card-total' : ''}`}>
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
          <span className="completion-value">{counts.today}</span>
          <span className="completion-label">Today</span>
        </div>
        <div className="completion-stat">
          <span className="completion-value">{counts.thisWeek}</span>
          <span className="completion-label">This week</span>
        </div>
        <div className="completion-stat">
          <span className="completion-value">{counts.thisMonth}</span>
          <span className="completion-label">This month</span>
        </div>
        <div className="completion-stat">
          <span className="completion-value">{counts.allTime}</span>
          <span className="completion-label">All time</span>
        </div>
      </div>
    </div>
  );
}

export default function AdminDashboardPage() {
  const { tasks, loading } = useTasks();
  const { employees, loading: employeesLoading } = useEmployees();

  const teamCounts = useMemo(() => computeCompletionCounts(tasks), [tasks]);
  const perEmployeeCounts = useMemo(
    () => computeCompletionCountsByEmployee(tasks, employees.map((e) => e.id)),
    [tasks, employees],
  );

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
              How many tasks have been marked complete, together and by employee.
            </p>
            {employeesLoading ? (
              <ListSkeleton rows={2} />
            ) : (
              <div className="completion-grid">
                <CompletionCard name="All employees" counts={teamCounts} total />
                {employees.map((emp) => (
                  <CompletionCard
                    key={emp.id}
                    name={emp.full_name}
                    counts={perEmployeeCounts.get(emp.id) ?? { today: 0, thisWeek: 0, thisMonth: 0, allTime: 0 }}
                    badge={{ initials: employeeInitials(emp.full_name), colorSlot: employeeColorSlot(emp.id, employees) }}
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
    </div>
  );
}
