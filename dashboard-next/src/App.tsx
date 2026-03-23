import { BrowserRouter, Routes, Route } from 'react-router';
import { useMemo } from 'react';
import { Sidebar } from './components/Sidebar';
import { TopBar } from './components/TopBar';
import { CommandCenter } from './pages/CommandCenter';
import { Issues } from './pages/Issues';
import { Tasks } from './pages/Tasks';
import { Agents } from './pages/Agents';
import { Project } from './pages/Project';
import { Insights } from './pages/Insights';
import { Settings } from './pages/Settings';
import { Commands } from './pages/Commands';
import { useWebSocket } from './hooks/useWebSocket';
import { useApi } from './hooks/useApi';
import type { AuditReport, WorkerState } from './types';

export function App() {
  const ws = useWebSocket();
  const { data: audit, refetch: refetchAudit } = useApi<AuditReport | null>('/api/audit', null);
  const { data: upgrades } = useApi<{
    packages?: Array<{ name: string; current: string; latest: string; type: string }>;
  }>('/api/upgrades/scan', {});

  const issueCount = (audit?.findings?.length ?? 0) + (upgrades?.packages?.length ?? 0);
  const healthScore = audit?.score ?? null;
  const projectName = audit?.project ?? 'ERNE Project';

  const workerState = ws.workerState as WorkerState | null;

  const today = new Date().toISOString().slice(0, 10);
  const taskCount = useMemo(() => {
    return Object.values(ws.history).reduce((sum, entries) => {
      return sum + entries.filter((e) => e.timestamp?.startsWith(today)).length;
    }, 0);
  }, [ws.history, today]);

  return (
    <BrowserRouter>
      <div className="flex flex-col h-screen">
        <TopBar
          projectName={projectName}
          activeAgents={ws.activeAgentCount}
          healthScore={healthScore}
          issueCount={issueCount}
          connected={ws.connected}
        />
        <div className="flex flex-1 min-h-0">
          <Sidebar
            issueCount={issueCount}
            taskCount={taskCount}
            activeAgents={ws.activeAgentCount}
          />
          <main className="flex-1 overflow-y-auto">
            <Routes>
              <Route
                path="/"
                element={
                  <CommandCenter
                    agents={ws.agents}
                    history={ws.history}
                    events={ws.events}
                    audit={audit}
                    refetchAudit={refetchAudit}
                  />
                }
              />
              <Route
                path="/issues"
                element={
                  <Issues
                    audit={audit}
                    upgrades={upgrades}
                    refetchAudit={refetchAudit}
                    onWsMessage={ws.addHandler}
                  />
                }
              />
              <Route path="/tasks" element={<Tasks workerState={workerState} />} />
              <Route path="/agents" element={<Agents agents={ws.agents} history={ws.history} />} />
              <Route path="/project" element={<Project audit={audit} />} />
              <Route path="/insights" element={<Insights />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/commands" element={<Commands />} />
            </Routes>
          </main>
        </div>
      </div>
    </BrowserRouter>
  );
}
