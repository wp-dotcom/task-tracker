import { useEffect, useMemo } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTasks } from '../context/TasksContext';
import OfflineBanner from './OfflineBanner';

const BASE_TITLE = 'Task Tracker';

interface NavItem {
  to: string;
  label: string;
  icon: string;
}

const ADMIN_NAV: NavItem[] = [
  { to: '/calendar', label: 'Calendar', icon: '📅' },
  { to: '/tasks', label: 'Tasks', icon: '☰' },
  { to: '/employees', label: 'Employees', icon: '👤' },
  { to: '/templates', label: 'Templates', icon: '📋' },
  { to: '/settings', label: 'Settings', icon: '⚙' },
];

const EMPLOYEE_NAV: NavItem[] = [
  { to: '/my-tasks', label: 'My Tasks', icon: '☰' },
  { to: '/calendar', label: 'Calendar', icon: '📅' },
];

export default function AppLayout() {
  const { profile, signOut } = useAuth();
  const { tasks } = useTasks();
  const nav = profile?.role === 'admin' ? ADMIN_NAV : EMPLOYEE_NAV;

  // Unviewed, still-open tasks — the whole point of "New" is that the
  // employee hasn't looked at it yet, so completed tasks don't count.
  const unviewedCount = useMemo(
    () => tasks.filter((t) => t.status === 'open' && !t.first_viewed_at).length,
    [tasks],
  );

  // Surface new tasks even when the browser tab isn't focused, so the
  // employee notices without having to be looking at the app.
  useEffect(() => {
    document.title =
      profile?.role === 'employee' && unviewedCount > 0
        ? `(${unviewedCount}) ${BASE_TITLE}`
        : BASE_TITLE;
    return () => {
      document.title = BASE_TITLE;
    };
  }, [profile?.role, unviewedCount]);

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-brand">Task Tracker</div>
        <nav className="sidebar-nav">
          {nav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => `sidebar-link${isActive ? ' active' : ''}`}
            >
              <span className="sidebar-icon" aria-hidden="true">
                {item.icon}
              </span>
              {item.label}
              {item.to === '/my-tasks' && unviewedCount > 0 && (
                <span className="nav-badge">
                  <span aria-hidden="true">{unviewedCount}</span>
                  <span className="visually-hidden">
                    {unviewedCount} new, unviewed task{unviewedCount === 1 ? '' : 's'}
                  </span>
                </span>
              )}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-footer">
          <div className="sidebar-user">
            <div className="sidebar-user-name">{profile?.full_name}</div>
            <div className="sidebar-user-role">{profile?.role === 'admin' ? 'Admin' : 'Employee'}</div>
          </div>
          <button type="button" className="btn btn-ghost btn-block" onClick={() => signOut()}>
            Log out
          </button>
        </div>
      </aside>

      <main className="app-main">
        <OfflineBanner />
        <Outlet />
      </main>

      <nav className="mobile-tabbar" aria-label="Primary">
        {nav.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) => `mobile-tab${isActive ? ' active' : ''}`}
          >
            <span className="mobile-tab-icon" aria-hidden="true">
              {item.icon}
              {item.to === '/my-tasks' && unviewedCount > 0 && <span className="nav-badge-dot" />}
            </span>
            <span>
              {item.label}
              {item.to === '/my-tasks' && unviewedCount > 0 && (
                <span className="visually-hidden">
                  {' '}
                  ({unviewedCount} new, unviewed task{unviewedCount === 1 ? '' : 's'})
                </span>
              )}
            </span>
          </NavLink>
        ))}
        <button type="button" className="mobile-tab" onClick={() => signOut()}>
          <span aria-hidden="true">⎋</span>
          <span>Log out</span>
        </button>
      </nav>
    </div>
  );
}
