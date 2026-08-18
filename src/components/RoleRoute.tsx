import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import type { UserRole } from '../types';

/**
 * Restricts a route to one or more roles. Must be nested inside
 * ProtectedRoute (assumes profile is already loaded). If an employee
 * manually navigates to an admin-only URL, they are redirected to their
 * own home page rather than shown an error.
 */
export default function RoleRoute({
  allow,
  children,
}: {
  allow: UserRole[];
  children: ReactNode;
}) {
  const { profile } = useAuth();

  if (!profile) return null;

  if (!allow.includes(profile.role)) {
    const fallback = profile.role === 'admin' ? '/calendar' : '/my-tasks';
    return <Navigate to={fallback} replace />;
  }

  return <>{children}</>;
}
