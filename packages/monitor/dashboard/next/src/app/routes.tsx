import { Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from './AppShell';
import { OverviewPage } from '@/pages/overview';
// ── page imports (lead-owned; one line per page as agents land them) ──
// import { CrashesPage, CrashDetailPage } from '@/pages/crashes';
// import { AnrsPage, AnrDetailPage } from '@/pages/anrs';
// import { PerformancePage } from '@/pages/performance';
// import { SessionsPage, SessionDetailPage } from '@/pages/sessions';
// import { QualityPage } from '@/pages/quality';
// import { SettingsPage } from '@/pages/settings';

/**
 * The app's route table. Every route renders inside <AppShell> (sidebar +
 * header + <Outlet/>). This file is the single shared seam between the
 * parallel page builds — pages register their routes here.
 */
export function AppRoutes() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<OverviewPage />} />
        {/* ── page routes (lead-owned; insert below as pages land) ── */}
        {/* <Route path="crashes" element={<CrashesPage />} /> */}
        {/* <Route path="crashes/:fingerprint" element={<CrashDetailPage />} /> */}
        {/* <Route path="anrs" element={<AnrsPage />} /> */}
        {/* <Route path="anrs/:id" element={<AnrDetailPage />} /> */}
        {/* <Route path="performance" element={<PerformancePage />} /> */}
        {/* <Route path="sessions" element={<SessionsPage />} /> */}
        {/* <Route path="sessions/:id" element={<SessionDetailPage />} /> */}
        {/* <Route path="quality" element={<QualityPage />} /> */}
        {/* <Route path="settings" element={<SettingsPage />} /> */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
