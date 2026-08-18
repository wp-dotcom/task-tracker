import { Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { TasksProvider } from './context/TasksContext';
import { CalendarEventsProvider } from './context/CalendarEventsContext';
import { UrgencyProvider } from './context/UrgencyContext';
import { isSupabaseConfigured } from './lib/supabase';
import ProtectedRoute from './components/ProtectedRoute';
import RoleRoute from './components/RoleRoute';
import AppLayout from './components/AppLayout';
import LoginPage from './pages/LoginPage';
import AdminCalendarPage from './pages/AdminCalendarPage';
import AdminTasksPage from './pages/AdminTasksPage';
import AdminEmployeesPage from './pages/AdminEmployeesPage';
import AdminTemplatesPage from './pages/AdminTemplatesPage';
import AdminSettingsPage from './pages/AdminSettingsPage';
import EmployeeMyTasksPage from './pages/EmployeeMyTasksPage';
import EmployeeCalendarPage from './pages/EmployeeCalendarPage';
import NotFoundPage from './pages/NotFoundPage';
import ConfigMissingPage from './pages/ConfigMissingPage';

function HomeRedirect() {
  const { profile } = useAuth();
  if (!profile) return null;
  return <Navigate to={profile.role === 'admin' ? '/calendar' : '/my-tasks'} replace />;
}

/** /calendar is shared by both roles but shows a different, role-appropriate view. */
function CalendarRoute() {
  const { profile } = useAuth();
  if (!profile) return null;
  return profile.role === 'admin' ? <AdminCalendarPage /> : <EmployeeCalendarPage />;
}

function AuthenticatedApp() {
  return (
    <ProtectedRoute>
      <UrgencyProvider>
        <TasksProvider>
          <CalendarEventsProvider>
            <Routes>
              <Route element={<AppLayout />}>
              <Route index element={<HomeRedirect />} />

              <Route path="calendar" element={<CalendarRoute />} />

              <Route
                path="tasks"
                element={
                  <RoleRoute allow={['admin']}>
                    <AdminTasksPage />
                  </RoleRoute>
                }
              />
              <Route
                path="employees"
                element={
                  <RoleRoute allow={['admin']}>
                    <AdminEmployeesPage />
                  </RoleRoute>
                }
              />
              <Route
                path="templates"
                element={
                  <RoleRoute allow={['admin']}>
                    <AdminTemplatesPage />
                  </RoleRoute>
                }
              />
              <Route
                path="settings"
                element={
                  <RoleRoute allow={['admin']}>
                    <AdminSettingsPage />
                  </RoleRoute>
                }
              />

              <Route
                path="my-tasks"
                element={
                  <RoleRoute allow={['employee']}>
                    <EmployeeMyTasksPage />
                  </RoleRoute>
                }
              />

                <Route path="*" element={<NotFoundPage />} />
              </Route>
            </Routes>
          </CalendarEventsProvider>
        </TasksProvider>
      </UrgencyProvider>
    </ProtectedRoute>
  );
}

export default function App() {
  if (!isSupabaseConfigured) {
    return <ConfigMissingPage />;
  }

  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/*" element={<AuthenticatedApp />} />
      </Routes>
    </AuthProvider>
  );
}
