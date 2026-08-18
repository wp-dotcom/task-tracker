import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import FullPageSpinner from './FullPageSpinner';

/** Requires a logged-in session with a loaded profile. Otherwise redirects to /login. */
export default function ProtectedRoute({ children }: { children: ReactNode }) {
  const { session, profile, loading } = useAuth();

  if (loading) return <FullPageSpinner />;
  if (!session) return <Navigate to="/login" replace />;
  if (!profile) return <FullPageSpinner label="Loading your account..." />;

  return <>{children}</>;
}
