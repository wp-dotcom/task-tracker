import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useEmployees } from '../hooks/useEmployees';
import { useTasks } from '../context/TasksContext';
import { isTaskOverdue } from '../lib/dates';
import { ListSkeleton } from '../components/Skeleton';

export default function AdminEmployeesPage() {
  const { employees, loading, error } = useEmployees();
  const { tasks } = useTasks();

  const stats = useMemo(() => {
    const map = new Map<string, { open: number; overdue: number; completed: number }>();
    for (const task of tasks) {
      const entry = map.get(task.assigned_to) ?? { open: 0, overdue: 0, completed: 0 };
      if (task.status === 'open') entry.open += 1;
      if (task.status === 'completed') entry.completed += 1;
      if (isTaskOverdue(task)) entry.overdue += 1;
      map.set(task.assigned_to, entry);
    }
    return map;
  }, [tasks]);

  return (
    <div className="page">
      <div className="page-header">
        <h1>Employees</h1>
      </div>

      {error && (
        <div role="alert" className="form-error">
          {error}
        </div>
      )}

      {loading ? (
        <ListSkeleton rows={2} />
      ) : employees.length === 0 ? (
        <div className="empty-state">
          <p>No employees yet.</p>
        </div>
      ) : (
        <div className="employee-list">
          {employees.map((emp) => {
            const s = stats.get(emp.id) ?? { open: 0, overdue: 0, completed: 0 };
            return (
              <div key={emp.id} className="employee-card">
                <Link to={`/tasks?employee=${emp.id}`} className="employee-card-name employee-card-name-link">
                  {emp.full_name}
                </Link>
                {emp.email && <div className="employee-card-email">{emp.email}</div>}
                <div className="employee-card-stats">
                  <Link to={`/tasks?employee=${emp.id}&filter=open`}>{s.open} open</Link>
                  <Link
                    to={`/tasks?employee=${emp.id}&filter=overdue`}
                    className={s.overdue > 0 ? 'text-danger' : ''}
                  >
                    {s.overdue} overdue
                  </Link>
                  <Link to={`/tasks?employee=${emp.id}&filter=completed`}>{s.completed} completed</Link>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="info-panel">
        <h2>Adding another employee</h2>
        <p>
          New accounts are created intentionally in Supabase — there is no public sign-up page.
          In your Supabase project, go to <strong>Authentication → Users → Add user</strong>,
          create the account with an email and password, and set the User Metadata to:
        </p>
        <pre className="code-block">{`{ "full_name": "Their Name", "role": "employee" }`}</pre>
        <p>
          A profile row is created automatically. They can then sign in immediately with the
          email/password you set, and will appear in this list and in the assignment dropdown.
        </p>
      </div>
    </div>
  );
}
