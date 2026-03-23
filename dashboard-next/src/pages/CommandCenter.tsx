import { useMemo, useState, useEffect } from 'react';
import { Link } from 'react-router';
import { Card } from '../components/Card';
import { Badge, StatusDot } from '../components/Badge';
import type { AgentMap, HistoryMap, AuditReport } from '../types';

interface CommandCenterProps {
  agents: AgentMap;
  history: HistoryMap;
  events: Array<{ time: string; icon: string; text: string }>;
  audit: AuditReport | null;
  refetchAudit: () => void;
}

export function CommandCenter({
  agents,
  history,
  events,
  audit,
  refetchAudit,
}: CommandCenterProps) {
  const score = audit?.score ?? null;
  const findings = audit?.findings ?? [];
  const criticalCount = findings.filter((f) => f.severity === 'critical').length;
  const warningCount = findings.filter((f) => f.severity === 'warning').length;

  const activeAgents = useMemo(
    () => Object.entries(agents).filter(([, a]) => a.status !== 'idle'),
    [agents],
  );
  const totalAgents = Object.keys(agents).length;

  const today = new Date().toISOString().slice(0, 10);
  const todayTaskCount = useMemo(
    () =>
      Object.values(history).reduce(
        (sum, entries) => sum + entries.filter((e) => e.timestamp?.startsWith(today)).length,
        0,
      ),
    [history, today],
  );

  const scoreColor =
    score === null
      ? 'text-text-muted'
      : score >= 80
        ? 'text-accent-green'
        : score >= 60
          ? 'text-accent-amber'
          : 'text-accent-red';

  const scoreBorder =
    score === null
      ? 'border-text-muted'
      : score >= 80
        ? 'border-accent-green'
        : score >= 60
          ? 'border-accent-amber'
          : 'border-accent-red';

  const summary = buildSummary(criticalCount, warningCount, activeAgents.length);

  const handleRunAudit = async () => {
    try {
      const res = await fetch('/api/audit/run', { method: 'POST' });
      if (res.ok) setTimeout(refetchAudit, 1000);
    } catch {
      // Server unreachable — ignore silently
    }
  };

  return (
    <div className="p-6 w-full">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-lg font-semibold">Command Center</h1>
        <div className="flex gap-2">
          <button
            onClick={handleRunAudit}
            className="px-3 py-1 rounded-md border text-[11px] transition-colors bg-accent-green/15 text-accent-green border-accent-green/30 hover:bg-accent-green/25"
          >
            Run Audit
          </button>
          <Link
            to="/tasks"
            className="px-3 py-1 rounded-md border text-[11px] transition-colors bg-accent-blue/15 text-accent-blue border-accent-blue/30 hover:bg-accent-blue/25"
          >
            New Task
          </Link>
        </div>
      </div>

      {/* Hero score */}
      <div className="flex items-center gap-6 mb-6">
        <div
          className={`w-20 h-20 rounded-full border-[3px] flex flex-col items-center justify-center ${scoreBorder}`}
        >
          <span className={`text-2xl font-bold ${scoreColor}`}>{score ?? '—'}</span>
          <span className={`text-[8px] uppercase ${scoreColor} opacity-70`}>Health</span>
        </div>
        <div>
          <div className="text-sm font-semibold">{audit?.project ?? 'Loading...'}</div>
          <div className="text-text-secondary text-sm mt-1">{summary}</div>
        </div>
      </div>

      {/* 2x2 Grid */}
      <div className="grid grid-cols-2 gap-4">
        {/* Issues */}
        <Card>
          <div className="flex items-center justify-between mb-3">
            <span className="text-text-secondary text-[10px] uppercase tracking-wide">Issues</span>
            <Link to="/issues" className="text-accent-blue text-[11px] hover:underline">
              View all &rarr;
            </Link>
          </div>
          {findings.length === 0 ? (
            <div className="text-text-muted text-sm">No audit data. Run an audit.</div>
          ) : (
            <div className="space-y-2">
              {findings.slice(0, 3).map((f, i) => (
                <div key={i} className="flex items-center gap-2 text-sm">
                  <Badge severity={f.severity} />
                  <span className="text-text-primary truncate">{f.title}</span>
                </div>
              ))}
              {findings.length > 3 && (
                <div className="text-text-muted text-[11px]">+{findings.length - 3} more</div>
              )}
            </div>
          )}
        </Card>

        {/* Agents */}
        <Card>
          <div className="flex items-center justify-between mb-3">
            <span className="text-text-secondary text-[10px] uppercase tracking-wide">Agents</span>
            <Link to="/agents" className="text-accent-blue text-[11px] hover:underline">
              Manage &rarr;
            </Link>
          </div>
          {activeAgents.length === 0 ? (
            <div className="text-text-muted text-sm">All {totalAgents} agents idle</div>
          ) : (
            <div className="space-y-2">
              {activeAgents.slice(0, 3).map(([name, agent]) => (
                <div key={name} className="flex items-center gap-2 text-sm">
                  <StatusDot status={agent.status} />
                  <span className="text-text-primary">{name}</span>
                  <span className="text-text-muted text-[11px]">{agent.status}</span>
                </div>
              ))}
              {activeAgents.length > 3 && (
                <div className="text-text-muted text-[11px]">+{activeAgents.length - 3} more</div>
              )}
            </div>
          )}
        </Card>

        {/* Tasks */}
        <Card>
          <div className="flex items-center justify-between mb-3">
            <span className="text-text-secondary text-[10px] uppercase tracking-wide">Tasks</span>
            <Link to="/tasks" className="text-accent-blue text-[11px] hover:underline">
              View all &rarr;
            </Link>
          </div>
          <div className="text-2xl font-bold text-accent-blue">{todayTaskCount}</div>
          <div className="text-text-muted text-[11px] mt-1">tasks today</div>
        </Card>

        {/* Activity */}
        <Card>
          <div className="flex items-center justify-between mb-3">
            <span className="text-text-secondary text-[10px] uppercase tracking-wide">
              Activity
            </span>
          </div>
          {events.length === 0 ? (
            <div className="text-text-muted text-sm">No recent activity</div>
          ) : (
            <div className="space-y-2">
              {events.slice(0, 4).map((ev, i) => (
                <div key={i} className="flex items-center gap-2 text-[11px]">
                  <span>{ev.icon}</span>
                  <span className="text-text-primary truncate">{ev.text}</span>
                  <span className="text-text-muted ml-auto whitespace-nowrap">
                    {formatTime(ev.time)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* Doctor Health Check — stays in Command Center */}
      <h2 className="text-sm font-semibold text-text-secondary mt-6 mb-3">System Health</h2>
      <DoctorChecks />
    </div>
  );
}

function buildSummary(critical: number, warning: number, activeAgents: number): string {
  const parts: string[] = [];
  if (critical > 0)
    parts.push(`${critical} critical issue${critical !== 1 ? 's' : ''} need attention`);
  if (warning > 0) parts.push(`${warning} warning${warning !== 1 ? 's' : ''}`);
  parts.push(`${activeAgents} agent${activeAgents !== 1 ? 's' : ''} active`);
  return parts.join('. ') + '.';
}

function formatTime(iso: string): string {
  try {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    return `${hrs}h ago`;
  } catch {
    return '';
  }
}

// #4 Doctor Health Checks
const DOCTOR_CHECKS = [
  { id: 'claudemd', label: 'CLAUDE.md', icon: '📄' },
  { id: 'hooks', label: 'Hooks configured', icon: '🪝' },
  { id: 'settings', label: 'Settings.json', icon: '⚙️' },
  { id: 'package', label: 'Package.json', icon: '📦' },
  { id: 'typescript', label: 'TypeScript', icon: '🔷' },
  { id: 'mcp', label: 'MCP servers', icon: '🔌' },
  { id: 'nodemodules', label: 'node_modules', icon: '📁' },
  { id: 'variants', label: 'Agent variants', icon: '🔀' },
  { id: 'profile', label: 'Hook profile', icon: '🛡️' },
];

function DoctorChecks() {
  const [checks, setChecks] = useState<Record<string, boolean>>({});
  useEffect(() => {
    fetch('/api/myapp/overview')
      .then((r) => r.json())
      .then((d) => {
        const det = d?.detection || {};
        const has = (v: unknown) => !!v && v !== 'none' && v !== 'unknown';
        setChecks({
          claudemd: !!d?.project?.name,
          hooks: true,
          settings: true,
          package: !!d?.project?.version,
          typescript: !!det.hasTypescript,
          mcp: (d?.mcp || []).length > 0,
          nodemodules: true,
          variants: true,
          profile: has(det.profile),
        });
      })
      .catch(() => {});
  }, []);

  return (
    <div className="grid grid-cols-3 gap-2">
      {DOCTOR_CHECKS.map((c) => (
        <div
          key={c.id}
          className="flex items-center gap-2 p-2 bg-bg-surface border border-border rounded-lg text-[11px]"
        >
          <span>{c.icon}</span>
          <span className="text-text-primary flex-1">{c.label}</span>
          <span
            className={`w-2 h-2 rounded-full ${checks[c.id] ? 'bg-accent-green' : 'bg-accent-red'}`}
          />
        </div>
      ))}
    </div>
  );
}
