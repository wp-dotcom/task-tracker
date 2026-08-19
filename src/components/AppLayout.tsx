import { useEffect, useMemo, useRef, useState } from 'react';
import type { TouchEvent as ReactTouchEvent } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTasks } from '../context/TasksContext';
import OfflineBanner from './OfflineBanner';
import PullToRefresh from './PullToRefresh';
import ThemeToggle from './ThemeToggle';

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
  { to: '/notifications', label: 'Notifications' },
  { to: '/settings', label: 'Settings' },
];

const EMPLOYEE_NAV: NavItem[] = [
  { to: '/my-tasks', label: 'My Tasks' },
  { to: '/calendar', label: 'Calendar' },
  { to: '/notifications', label: 'Notifications' },
];

// Swipe left/right anywhere on a page to move to the next/previous item in
// the nav above (same order as the sidebar/mobile menu), with wraparound.
// Same drag-then-commit-or-snap-back shape as TaskCard's swipe, just for a
// whole page instead of a 84px reveal.
const PAGE_SWIPE_TAP_SLOP_PX = 8;
const PAGE_SWIPE_THRESHOLD_PX = 60;
const PAGE_SWIPE_EXIT_MS = 220;
// Things that already own left/right swipe (a task card, the mobile
// calendar's month/week paging) or need native horizontal drag/scroll (a
// code block, FullCalendar's own drag-to-select) or float above the page as
// an overlay (a modal) — a swipe starting on any of these should do what
// THAT element does, not change pages out from under it.
const PAGE_SWIPE_IGNORE_SELECTOR = '.task-card, .apple-calendar-grid, .modal-overlay, .code-block, .fc';

export default function AppLayout() {
  const { profile, signOut } = useAuth();
  const { tasks } = useTasks();
  const isAdmin = profile?.role === 'admin';
  const nav = isAdmin ? ADMIN_NAV : EMPLOYEE_NAV;
  // Where tapping the brand/logo takes you — each role's own task list.
  const tasksPath = isAdmin ? '/tasks' : '/my-tasks';
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  // -1 on a page that isn't in the nav at all (e.g. Change Password, an
  // employee detail page) — swiping there does nothing, since there's no
  // well-defined "next" page to jump to.
  const currentNavIndex = nav.findIndex((item) => item.to === location.pathname);

  const [pageSwipeX, setPageSwipeX] = useState(0);
  const [pageSwipeDragging, setPageSwipeDragging] = useState(false);
  const [pageSwipeExiting, setPageSwipeExiting] = useState(false);
  const [pageSwipeEnter, setPageSwipeEnter] = useState<'from-left' | 'from-right' | null>(null);
  const pageSwipeStartX = useRef<number | null>(null);
  const pageSwipeStartY = useRef<number | null>(null);
  const pageSwipeDraggingRef = useRef(false);
  const pendingPageSwipeNav = useRef<{ to: string; dir: 'from-left' | 'from-right' } | null>(null);

  function handlePageSwipeStart(e: ReactTouchEvent) {
    if (pageSwipeExiting || currentNavIndex < 0) return;
    if (e.target instanceof Element && e.target.closest(PAGE_SWIPE_IGNORE_SELECTOR)) return;
    pageSwipeStartX.current = e.touches[0]?.clientX ?? null;
    pageSwipeStartY.current = e.touches[0]?.clientY ?? null;
    pageSwipeDraggingRef.current = false;
  }

  function handlePageSwipeMove(e: ReactTouchEvent) {
    if (pageSwipeStartX.current == null) return;
    const x = e.touches[0]?.clientX ?? pageSwipeStartX.current;
    const y = e.touches[0]?.clientY ?? pageSwipeStartY.current ?? 0;
    const dx = x - pageSwipeStartX.current;
    const dy = y - (pageSwipeStartY.current ?? 0);

    if (!pageSwipeDraggingRef.current) {
      if (Math.abs(dx) < PAGE_SWIPE_TAP_SLOP_PX && Math.abs(dy) < PAGE_SWIPE_TAP_SLOP_PX) return;
      if (Math.abs(dy) > Math.abs(dx)) {
        pageSwipeStartX.current = null; // vertical scroll, not a page swipe
        return;
      }
      pageSwipeDraggingRef.current = true;
      setPageSwipeDragging(true);
    }
    setPageSwipeX(Math.max(-window.innerWidth, Math.min(window.innerWidth, dx)));
  }

  function handlePageSwipeEnd() {
    if (pageSwipeStartX.current == null) return;
    pageSwipeStartX.current = null;
    if (!pageSwipeDraggingRef.current) return;
    pageSwipeDraggingRef.current = false;
    setPageSwipeDragging(false);

    if (Math.abs(pageSwipeX) < PAGE_SWIPE_THRESHOLD_PX) {
      setPageSwipeX(0);
      return;
    }
    const goingNext = pageSwipeX < 0;
    const targetIndex = (currentNavIndex + (goingNext ? 1 : -1) + nav.length) % nav.length;
    const target = nav[targetIndex];
    const reduceMotion =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduceMotion) {
      setPageSwipeX(0);
      navigate(target.to);
      return;
    }
    setPageSwipeExiting(true);
    setPageSwipeX(goingNext ? -window.innerWidth : window.innerWidth);
    pendingPageSwipeNav.current = { to: target.to, dir: goingNext ? 'from-right' : 'from-left' };
  }

  // Once the current page has finished sliding off, actually change routes
  // and let the new page slide in from the opposite edge.
  useEffect(() => {
    if (!pageSwipeExiting) return;
    const timer = setTimeout(() => {
      const pending = pendingPageSwipeNav.current;
      pendingPageSwipeNav.current = null;
      setPageSwipeExiting(false);
      setPageSwipeX(0);
      if (pending) {
        navigate(pending.to);
        setPageSwipeEnter(pending.dir);
      }
    }, PAGE_SWIPE_EXIT_MS);
    return () => clearTimeout(timer);
  }, [pageSwipeExiting, navigate]);

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
        <Link to={tasksPath} className="sidebar-brand">
          Mid Haven Furniture
        </Link>
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
          <div className="sidebar-theme">
            <span className="sidebar-theme-label">Theme</span>
            <ThemeToggle id="sidebar-theme-toggle" />
          </div>
          <Link to="/change-password" className="sidebar-user" title="Change password">
            <div className="sidebar-user-name">{profile?.full_name}</div>
            <div className="sidebar-user-role">{profile?.role === 'admin' ? 'Admin' : 'Employee'}</div>
          </Link>
          <button type="button" className="btn btn-ghost btn-block" onClick={() => signOut()}>
            Log out
          </button>
        </div>
      </aside>

      <main
        className="app-main"
        onTouchStart={handlePageSwipeStart}
        onTouchMove={handlePageSwipeMove}
        onTouchEnd={handlePageSwipeEnd}
        onTouchCancel={handlePageSwipeEnd}
      >
        <PullToRefresh />
        <OfflineBanner />
        <div
          className={`page-swipe-viewport${pageSwipeEnter ? ` page-swipe-enter-${pageSwipeEnter}` : ''}`}
          style={
            pageSwipeDragging || pageSwipeExiting
              ? {
                  transform: `translateX(${pageSwipeX}px)`,
                  transition: pageSwipeDragging ? 'none' : `transform ${PAGE_SWIPE_EXIT_MS}ms ease`,
                }
              : undefined
          }
          onAnimationEnd={() => setPageSwipeEnter(null)}
        >
          <Outlet />
        </div>
      </main>

      <header className="mobile-topbar">
        <Link to={tasksPath} className="mobile-topbar-brand">
          Mid Haven Furniture
        </Link>
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
            <div className="mobile-menu-theme">
              <span className="sidebar-theme-label">Theme</span>
              <ThemeToggle id="mobile-theme-toggle" />
            </div>
            <Link
              to="/change-password"
              className="mobile-menu-user"
              onClick={() => setMenuOpen(false)}
            >
              <div className="sidebar-user-name">{profile?.full_name}</div>
              <div className="sidebar-user-role">
                {profile?.role === 'admin' ? 'Admin' : 'Employee'}
              </div>
            </Link>
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
