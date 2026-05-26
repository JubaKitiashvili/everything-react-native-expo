import { Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from './AppShell';
import { OverviewPage } from '@/pages/overview';
import { CrashesPage } from '@/pages/crashes';
import { AnrsPage } from '@/pages/anrs';
import { PerformancePage } from '@/pages/performance';
import { SessionsPage } from '@/pages/sessions';
import { QualityPage } from '@/pages/quality';
import { SettingsPage } from '@/pages/settings';

/**
 * The app's route table. Every route renders inside <AppShell> (sidebar +
 * header + <Outlet/>). Order mirrors the sidebar nav.
 */
export function AppRoutes() {
  return (
    <Routes>
      <Route element={<AppShell />}>
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
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
