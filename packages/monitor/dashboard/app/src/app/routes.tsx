import { Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from './AppShell';
import { RequireAuth } from '@/shared/auth/RequireAuth';
import { OverviewPage } from '@/pages/overview';
import { CrashesPage } from '@/pages/crashes';
import { AnrsPage } from '@/pages/anrs';
import { PerformancePage } from '@/pages/performance';
import { SessionsPage } from '@/pages/sessions';
import { QualityPage } from '@/pages/quality';
import { SettingsPage } from '@/pages/settings';
import { UserDetailPage } from '@/pages/users';
import { LoginPage } from '@/pages/login';

/**
 * The app's route table. `/login` stands alone (no shell); every other route
 * renders inside <AppShell> behind <RequireAuth> (sidebar + header +
 * <Outlet/>). Order mirrors the sidebar nav.
 */
export function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        element={
          <RequireAuth>
            <AppShell />
          </RequireAuth>
        }
      >
        <Route index element={<OverviewPage />} />
        <Route path="crashes" element={<CrashesPage />} />
        <Route path="crashes/:fingerprint" element={<CrashesPage />} />
        <Route path="anrs" element={<AnrsPage />} />
        <Route path="anrs/:id" element={<AnrsPage />} />
        <Route path="performance" element={<PerformancePage />} />
        <Route path="sessions" element={<SessionsPage />} />
        <Route path="sessions/:id" element={<SessionsPage />} />
        <Route path="quality" element={<QualityPage />} />
        <Route path="settings" element={<SettingsPage />} />
        {/* user drill-down (linked from sessions/crashes; not a sidebar item) */}
        <Route path="users/:id" element={<UserDetailPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
