import { useState, useEffect } from 'react';
import { Card } from '../components/Card';

interface Snapshot {
  date: string;
  auditScore: number;
  dependencies?: { total: number; outdated: number; major: number; security: number };
  agents?: { tasksCompleted: number; totalWorkTimeMs: number; mostUsed: string | null };
}

interface AgentUsage {
  name: string;
  ms: number;
  pct: number;
}

interface EcoItem {
  type: string;
  tag: string;
  package: string;
  title: string;
  summary: string;
  url: string;
  timestamp: string;
  relevance: number;
  version?: { current: string | null; latest: string };
}

export function Insights() {
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [agents, setAgents] = useState<AgentUsage[]>([]);
  const [eco, setEco] = useState<EcoItem[]>([]);

  useEffect(() => {
    fetch('/api/insights/snapshots')
      .then((r) => r.json())
      .then((d) => setSnapshots(d?.snapshots || []))
      .catch(() => {});
    fetch('/api/insights/agents')
      .then((r) => r.json())
      .then((d) => setAgents(d?.agents || []))
      .catch(() => {});
    fetch('/api/ecosystem/feed')
      .then((r) => r.json())
      .then((d) => setEco((d?.items || []).slice(0, 15)))
      .catch(() => {});
  }, []);

  const latest = snapshots[snapshots.length - 1];
  const prev = snapshots.length > 1 ? snapshots[snapshots.length - 2] : null;
  const scoreDelta = prev ? (latest?.auditScore ?? 0) - (prev?.auditScore ?? 0) : 0;

  return (
    <div className="p-6 w-full">
      <h1 className="text-lg font-semibold mb-6">Insights</h1>

      {/* Summary cards */}
      <div className="grid grid-cols-4 gap-3 mb-6">
        <SummaryCard
          label="Health Score"
          value={latest?.auditScore ?? '—'}
          delta={scoreDelta}
          color="text-accent-blue"
        />
        <SummaryCard
          label="Outdated Deps"
          value={latest?.dependencies?.outdated ?? '—'}
          sub={`of ${latest?.dependencies?.total ?? '?'} total`}
          color={latest?.dependencies?.outdated ? 'text-accent-amber' : 'text-accent-green'}
        />
        <SummaryCard
          label="Security Issues"
          value={latest?.dependencies?.security ?? 0}
          color={latest?.dependencies?.security ? 'text-accent-red' : 'text-accent-green'}
        />
        <SummaryCard
          label="Snapshots"
          value={snapshots.length}
          sub="data points"
          color="text-text-secondary"
        />
      </div>

      {/* Score over time */}
      {snapshots.length > 0 && (
        <>
          <h2 className="text-sm font-semibold text-text-secondary mb-3">
            Health Score Over Time
            <span className="text-[10px] text-text-muted font-normal ml-2">
              — How your project health changes with each audit. Higher is better.
            </span>
          </h2>
          <Card className="mb-6">
            <div className="flex items-end gap-2 h-32">
              {snapshots.map((s, i) => (
                <div
                  key={i}
                  className="flex-1 flex flex-col items-center justify-end h-full group relative"
                >
                  <div className="text-[9px] text-text-muted mb-1 opacity-0 group-hover:opacity-100">
                    {s.auditScore}
                  </div>
                  <div
                    className="w-full bg-accent-blue hover:bg-accent-blue/80 rounded-t-sm transition-colors"
                    style={{ height: `${Math.max(s.auditScore, 2)}%` }}
                  />
                  <div className="text-[8px] text-text-muted mt-1 truncate w-full text-center">
                    {s.date.slice(5)}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </>
      )}

      {/* Agent Work Distribution */}
      {agents.length > 0 && (
        <>
          <h2 className="text-sm font-semibold text-text-secondary mb-3">
            Agent Work Distribution
            <span className="text-[10px] text-text-muted font-normal ml-2">
              — How much time each agent spent working in this session. Shows which agents you rely
              on most.
            </span>
          </h2>
          <Card className="mb-6">
            <div className="space-y-3">
              {agents.map((a) => (
                <div key={a.name} className="flex items-center gap-3">
                  <span className="text-[11px] text-text-primary w-40 truncate font-mono">
                    {a.name}
                  </span>
                  <div className="flex-1 h-3 bg-border rounded-full overflow-hidden">
                    <div
                      className="h-full bg-accent-purple rounded-full transition-all"
                      style={{ width: `${Math.max(a.pct, 2)}%` }}
                    />
                  </div>
                  <span className="text-[11px] text-text-secondary w-10 text-right">{a.pct}%</span>
                  <span className="text-[10px] text-text-muted w-16 text-right">
                    {formatMs(a.ms)}
                  </span>
                </div>
              ))}
            </div>
          </Card>
        </>
      )}

      {/* Ecosystem Feed */}
      {eco.length > 0 && (
        <>
          <h2 className="text-sm font-semibold text-text-secondary mb-3">
            Ecosystem Updates
            <span className="text-[10px] text-text-muted font-normal ml-2">
              — New releases from React Native packages relevant to your project.
            </span>
          </h2>
          <div className="space-y-2 mb-6">
            {eco.map((item, i) => (
              <a
                key={i}
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-4 p-3 bg-bg-surface border border-border rounded-lg hover:border-border-light transition-colors group"
              >
                <div className="shrink-0">
                  <span
                    className={`text-[9px] px-1.5 py-0.5 rounded uppercase tracking-wide ${
                      item.tag === 'NEW'
                        ? 'bg-accent-green/15 text-accent-green'
                        : item.tag === 'BREAKING'
                          ? 'bg-accent-red/15 text-accent-red'
                          : 'bg-accent-blue/15 text-accent-blue'
                    }`}
                  >
                    {item.tag}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-text-primary font-mono">{item.package}</span>
                    {item.version?.latest && (
                      <span className="text-[10px] text-accent-blue">{item.version.latest}</span>
                    )}
                  </div>
                  <div className="text-[11px] text-text-secondary mt-0.5 truncate">
                    {item.summary?.replace(/\r?\n/g, ' ').slice(0, 120)}
                  </div>
                </div>
                <div className="shrink-0 flex flex-col items-end gap-1">
                  <span className="text-[9px] text-text-muted">{formatDate(item.timestamp)}</span>
                  <span className="text-[9px] text-accent-blue opacity-0 group-hover:opacity-100">
                    Open &rarr;
                  </span>
                </div>
              </a>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function SummaryCard({
  label,
  value,
  delta,
  sub,
  color,
}: {
  label: string;
  value: string | number;
  delta?: number;
  sub?: string;
  color: string;
}) {
  return (
    <Card>
      <div className="text-[10px] text-text-muted uppercase tracking-wide">{label}</div>
      <div className="flex items-baseline gap-2 mt-1">
        <span className={`text-2xl font-bold ${color}`}>{value}</span>
        {delta !== undefined && delta !== 0 && (
          <span className={`text-[11px] ${delta > 0 ? 'text-accent-green' : 'text-accent-red'}`}>
            {delta > 0 ? '+' : ''}
            {delta}
          </span>
        )}
      </div>
      {sub && <div className="text-[10px] text-text-muted mt-0.5">{sub}</div>}
    </Card>
  );
}

function formatMs(ms: number): string {
  if (ms < 60000) return `${Math.round(ms / 1000)}s`;
  if (ms < 3600000) return `${Math.round(ms / 60000)}m`;
  return `${(ms / 3600000).toFixed(1)}h`;
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    const now = Date.now();
    const diff = now - d.getTime();
    if (diff < 86400000) return 'Today';
    if (diff < 172800000) return 'Yesterday';
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  } catch {
    return '';
  }
}
