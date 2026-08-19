import { useTasks } from '../context/TasksContext';
import DashboardSummary from '../components/DashboardSummary';
import AdminTaskCalendarPanel from '../components/AdminTaskCalendarPanel';

export default function AdminCalendarPage() {
  const { tasks } = useTasks();

  return (
    <div className="page">
      <div className="page-header">
        <h1>Calendar</h1>
      </div>

      <DashboardSummary tasks={tasks} />

      <AdminTaskCalendarPanel />
    </div>
  );
}
