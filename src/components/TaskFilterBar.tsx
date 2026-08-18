import type { Profile, TaskListFilter } from '../types';
import Dropdown from './Dropdown';

const FILTERS: { value: TaskListFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'open', label: 'Open' },
  { value: 'completed', label: 'Completed' },
  { value: 'due_today', label: 'Due today' },
  { value: 'overdue', label: 'Overdue' },
  { value: 'not_viewed', label: 'Not viewed' },
  { value: 'viewed', label: 'Viewed' },
  { value: 'urgent', label: 'Urgent' },
  { value: 'completed_today', label: 'Completed today' },
];

interface TaskFilterBarProps {
  filter: TaskListFilter;
  onFilterChange: (filter: TaskListFilter) => void;
  employees: Profile[];
  employeeId: string | 'all';
  onEmployeeChange: (id: string | 'all') => void;
  search: string;
  onSearchChange: (value: string) => void;
}

export default function TaskFilterBar({
  filter,
  onFilterChange,
  employees,
  employeeId,
  onEmployeeChange,
  search,
  onSearchChange,
}: TaskFilterBarProps) {
  return (
    <div className="task-filter-bar">
      <div className="filter-chips">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            className={`filter-chip${filter === f.value ? ' active' : ''}`}
            onClick={() => onFilterChange(f.value)}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="filter-controls">
        {employees.length > 1 && (
          <Dropdown
            className="filter-select"
            value={employeeId}
            onChange={(v) => onEmployeeChange(v as string | 'all')}
            options={[
              { value: 'all', label: 'All employees' },
              ...employees.map((emp) => ({ value: emp.id, label: emp.full_name })),
            ]}
            aria-label="Filter by employee"
          />
        )}

        <input
          type="search"
          className="field-input filter-search"
          placeholder="Search tasks..."
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          aria-label="Search tasks"
        />
      </div>
    </div>
  );
}
