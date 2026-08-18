import { useEffect, useMemo, useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTasks } from '../context/TasksContext';
import OfflineBanner from './OfflineBanner';

const BASE_TITLE = 'Mid Haven Furniture';

interface NavItem {
  to: string;
  label: string;
}

const ADMIN_NAV: NavItem[] = [
  { to: '/calendar', label: 'Calendar' },
  { to: '/tasks', label: 'Tasks' },
  { to: '/employees', label: 'Employees' },
  { to: '/templates', label: 'Templates' },
  { to: '/settings', label: 'Settings' },
];

const EMPLOYEE_NAV: NavItem[] = [
  { to: '/my-tasks', label: 'My Tasks' },
  { to: '/calendar', label: 'Calendar' },
];

export default function AppLayout() {
  const { profile, signOut } = useAuth();
  const { tasks } = useTasks();
  const nav = profile?.role === 'admin' ? ADMIN_NAV : EMPLOYEE_NAV;
  const [menuOpen, setMenuOpen] = useState(false);

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

  // Dismiss the mobile menu on Escape, same pattern as the calendar's
  // quick-create popover.
  useEffect(() => {
    if (!menuOpen) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setMenuOpen(false);
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [menuOpen]);

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-brand">Mid Haven Furniture</div>
        <nav className="sidebar-nav">
          {nav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => `sidebar-link${isActive ? ' active' : ''}`}
            >
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

      <header className="mobile-topbar">
        <span className="mobile-topbar-brand">Mid Haven Furniture</span>
        <button
          type="button"
          className="mobile-menu-button"
          aria-label="Open menu"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((open) => !open)}
        >
          <span aria-hidden="true">☰</span>
          {profile?.role === 'employee' && unviewedCount > 0 && (
            <>
              <span className="nav-badge-dot" aria-hidden="true" />
              <span className="visually-hidden">
                {unviewedCount} new, unviewed task{unviewedCount === 1 ? '' : 's'}
              </span>
            </>
          )}
        </button>
      </header>

      {menuOpen && (
        <>
          <div
            className="mobile-menu-backdrop"
            role="presentation"
            onClick={() => setMenuOpen(false)}
          />
          <nav className="mobile-menu" aria-label="Primary">
            {nav.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) => `mobile-menu-link${isActive ? ' active' : ''}`}
                onClick={() => setMenuOpen(false)}
              >
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
            <div className="mobile-menu-divider" />
            <div className="mobile-menu-user">
              <div className="sidebar-user-name">{profile?.full_name}</div>
              <div className="sidebar-user-role">
                {profile?.role === 'admin' ? 'Admin' : 'Employee'}
              </div>
            </div>
            <button
              type="button"
              className="mobile-menu-logout"
              onClick={() => {
                setMenuOpen(false);
                signOut();
              }}
            >
              Log out
            </button>
          </nav>
        </>
      )}
    </div>
  );
}
