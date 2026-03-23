import { useState, useEffect, useCallback } from 'react';
import { Card } from '../components/Card';
import { CopyCommand } from '../components/CopyCommand';
import { useApi } from '../hooks/useApi';
import type { AppOverview, AuditReport, EnvironmentTool } from '../types';

interface ProjectProps {
  audit: AuditReport | null;
}

interface McpServerEntry {
  name: string;
  transport: string;
  source: string;
  status: string;
  config: Record<string, unknown>;
}

interface CatalogItem {
  id: string;
  name: string;
  description: string;
  transport: string;
  installed: boolean;
  config: Record<string, unknown>;
}

export function Project({ audit }: ProjectProps) {
  const { data: overview, loading } = useApi<AppOverview | null>('/api/myapp/overview', null);
  const { data: envData } = useApi<{ tools?: EnvironmentTool[] } | null>(
    '/api/myapp/environment',
    null,
  );

  // Extract nested data from API response shape: { project, detection, audit, mcp, updates, recommendations }
  const raw = overview as Record<string, unknown> | null;
  const proj = raw?.project as Record<string, string> | undefined;
  const detection = raw?.detection as Record<string, unknown> | undefined;
  const auditData = raw?.audit as { score?: number; findings?: unknown[] } | undefined;
  const recommendations = raw?.recommendations as
    | Array<{ type?: string; severity?: string; title?: string; message?: string }>
    | undefined;

  if (loading) {
    return (
      <div className="p-6">
        <h1 className="text-lg font-semibold mb-4">Project</h1>
        <div className="text-text-muted">Loading...</div>
      </div>
    );
  }

  return (
    <div className="p-6 w-full">
      <h1 className="text-lg font-semibold mb-6">Project</h1>

      {/* Stack & Environment */}
      <SectionTitle>Stack & Environment</SectionTitle>
      <div className="grid grid-cols-2 gap-4 mb-6">
        <Card>
          <div className="text-[10px] text-text-muted uppercase tracking-wide mb-2">App Info</div>
          <InfoRow label="Name" value={proj?.name} />
          <InfoRow label="Version" value={proj?.version} />
          <InfoRow label="Framework" value={detection?.framework} />
          <InfoRow label="TypeScript" value={detection?.hasTypescript ? 'Yes' : 'No'} />
          <InfoRow label="New Architecture" value={detection?.hasNewArch ? 'Yes' : 'No'} />
          {auditData?.score != null && (
            <InfoRow label="Health Score" value={String(auditData.score)} />
          )}
        </Card>
        <Card>
          <div className="text-[10px] text-text-muted uppercase tracking-wide mb-2">Stack</div>
          {detection?.stack ? (
            Object.entries(detection.stack)
              .filter(([, v]) => v && v !== 'none')
              .map(([key, val]) => <InfoRow key={key} label={key} value={String(val)} />)
          ) : (
            <div className="text-text-muted text-sm">No stack data</div>
          )}
        </Card>
      </div>

      {/* Environment */}
      {envData?.tools && (
        <>
          <SectionTitle>Environment</SectionTitle>
          <div className="grid grid-cols-3 gap-3 mb-6">
            {envData.tools.map((tool) => (
              <Card key={tool.name} className="!p-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-text-primary">{tool.name}</span>
                  <span
                    className={`w-2 h-2 rounded-full ${
                      tool.status === 'ok'
                        ? 'bg-accent-green'
                        : tool.status === 'missing'
                          ? 'bg-accent-red'
                          : 'bg-accent-amber'
                    }`}
                  />
                </div>
                <div className="text-[11px] text-text-muted mt-1">
                  {tool.version ?? 'Not installed'}
                </div>
              </Card>
            ))}
          </div>
        </>
      )}

      {/* MCP Marketplace */}
      <SectionTitle>MCP Servers</SectionTitle>
      <McpSection />

      {/* Docs */}
      <SectionTitle>Generated Documentation</SectionTitle>
      <DocsGrid audit={audit} />

      {/* Recommendations */}
      {recommendations && recommendations.length > 0 && (
        <>
          <SectionTitle>Recommendations ({recommendations.length})</SectionTitle>
          <RecommendationsList recommendations={recommendations} />
        </>
      )}
    </div>
  );
}

// PROFILES, HookProfiles, CMDS, CommandsReference, ContextPanel moved to Settings/Commands pages
const _DEAD_START = [
  {
    id: 'minimal',
    icon: '⚡',
    name: 'minimal',
    desc: 'Fast iteration. No blocking hooks. Maximum speed.',
    features: ['Basic lint checks', 'No blocking hooks', 'Maximum speed'],
  },
  {
    id: 'standard',
    icon: '⚖️',
    name: 'standard',
    rec: true,
    desc: 'Balanced quality and speed. Catches real issues.',
    features: ['Platform-specific checks', 'Security scanning', 'Bundle size monitoring'],
  },
  {
    id: 'strict',
    icon: '🛡️',
    name: 'strict',
    desc: 'Production-grade enforcement for shipping apps.',
    features: ['Full lint + type checking', 'Accessibility audits', 'Performance budgets'],
  },
];

function HookProfiles() {
  const [current, setCurrent] = useState('standard');
  useEffect(() => {
    fetch('/api/myapp/overview')
      .then((r) => r.json())
      .then((d) => {
        const p = d?.erneSettings?.profile || d?.detection?.profile;
        if (p) setCurrent(p);
      })
      .catch(() => {});
  }, []);

  return (
    <>
      <SectionTitle>Hook Profiles</SectionTitle>
      <div className="grid grid-cols-3 gap-3 mb-2">
        {PROFILES.map((p) => {
          const active = current === p.id;
          return (
            <button
              key={p.id}
              onClick={() => setCurrent(p.id)}
              className={`text-left p-4 rounded-lg border transition-all ${active ? 'border-accent-blue bg-accent-blue/5 shadow-[0_0_12px_rgba(59,130,246,0.15)]' : 'border-border bg-bg-surface hover:border-border-light'}`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-lg">{p.icon}</span>
                {p.rec && !active && (
                  <span className="text-[8px] bg-accent-amber/20 text-accent-amber px-1.5 py-0.5 rounded uppercase tracking-wide">
                    Recommended
                  </span>
                )}
                {active && (
                  <span className="text-[8px] bg-accent-blue/20 text-accent-blue px-1.5 py-0.5 rounded uppercase tracking-wide">
                    Active
                  </span>
                )}
              </div>
              <div className="text-sm font-semibold text-text-primary font-mono mb-1">{p.name}</div>
              <div className="text-[11px] text-text-secondary mb-3">{p.desc}</div>
              <div className="space-y-1.5">
                {p.features.map((f, i) => (
                  <div key={i} className="flex items-center gap-2 text-[10px] text-text-muted">
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${active ? 'bg-accent-blue' : 'bg-accent-amber'}`}
                    />
                    {f}
                  </div>
                ))}
              </div>
            </button>
          );
        })}
      </div>
      <div className="mb-6 text-[11px] text-text-muted">
        Switch:{' '}
        <code className="bg-bg-hover px-1.5 py-0.5 rounded text-accent-blue text-[10px]">
          ERNE_PROFILE={current} claude
        </code>
      </div>
    </>
  );
}

const CMDS = [
  { cmd: '/erne-plan', desc: 'Design feature architecture', icon: '🏗️' },
  { cmd: '/erne-code', desc: 'Implement features', icon: '💻' },
  { cmd: '/erne-code-review', desc: 'Code review', icon: '🔍' },
  { cmd: '/erne-tdd', desc: 'Test-driven development', icon: '🧪' },
  { cmd: '/erne-build-fix', desc: 'Fix build failures', icon: '🔧' },
  { cmd: '/erne-perf', desc: 'Performance optimization', icon: '⚡' },
  { cmd: '/erne-upgrade', desc: 'Version migration', icon: '📦' },
  { cmd: '/erne-navigate', desc: 'Navigation architecture', icon: '🗺️' },
  { cmd: '/erne-component', desc: 'UI components', icon: '🎨' },
  { cmd: '/erne-animate', desc: 'Animations', icon: '✨' },
  { cmd: '/erne-debug', desc: 'Bug diagnosis', icon: '🐛' },
  { cmd: '/erne-debug-visual', desc: 'Visual debugging', icon: '📸' },
  { cmd: '/erne-deploy', desc: 'App submission', icon: '🚀' },
  { cmd: '/erne-quality-gate', desc: 'Pre-merge checks', icon: '✅' },
  { cmd: '/erne-worker', desc: 'Autonomous tickets', icon: '🤖' },
  { cmd: '/erne-feature', desc: 'Feature unit', icon: '🧩' },
  { cmd: '/erne-native-module', desc: 'Native modules', icon: '🔌' },
  { cmd: '/erne-orchestrate', desc: 'Multi-agent pipeline', icon: '🎯' },
  { cmd: '/erne-learn', desc: 'Pattern extraction', icon: '🧠' },
  { cmd: '/erne-retrospective', desc: 'Session analysis', icon: '📊' },
];

function CommandsReference() {
  const [copied, setCopied] = useState<string | null>(null);
  const copy = (cmd: string) => {
    navigator.clipboard.writeText(cmd).then(() => {
      setCopied(cmd);
      setTimeout(() => setCopied(null), 1500);
    });
  };

  return (
    <>
      <SectionTitle>ERNE Commands ({CMDS.length})</SectionTitle>
      <div className="grid grid-cols-2 gap-2 mb-6">
        {CMDS.map((c) => (
          <button
            key={c.cmd}
            onClick={() => copy(c.cmd)}
            className="flex items-center gap-3 p-3 bg-bg-surface border border-border rounded-lg hover:border-border-light transition-colors text-left group"
          >
            <span className="text-lg shrink-0">{c.icon}</span>
            <div className="flex-1 min-w-0">
              <code className="text-[12px] text-accent-blue font-mono">{c.cmd}</code>
              <div className="text-[10px] text-text-muted mt-0.5 truncate">{c.desc}</div>
            </div>
            <span
              className={`text-[9px] shrink-0 transition-colors ${copied === c.cmd ? 'text-accent-green' : 'text-text-muted opacity-0 group-hover:opacity-100'}`}
            >
              {copied === c.cmd ? 'Copied!' : 'Copy'}
            </span>
          </button>
        ))}
      </div>
    </>
  );
}

function McpSection() {
  const [servers, setServers] = useState<McpServerEntry[]>([]);
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [showCatalog, setShowCatalog] = useState(false);

  const fetchServers = useCallback(async () => {
    try {
      const res = await fetch('/api/mcp');
      if (res.ok) {
        const data = await res.json();
        setServers(data.servers ?? []);
      }
    } catch {}
  }, []);

  const fetchCatalog = useCallback(async () => {
    try {
      const res = await fetch('/api/mcp/catalog');
      if (res.ok) {
        const data = await res.json();
        setCatalog(data.catalog ?? []);
      }
    } catch {}
  }, []);

  useEffect(() => {
    fetchServers();
    fetchCatalog();
  }, [fetchServers, fetchCatalog]);

  const handleInstall = async (item: CatalogItem) => {
    await fetch('/api/mcp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: item.id, config: item.config }),
    });
    fetchServers();
    fetchCatalog();
  };

  const handleRemove = async (name: string) => {
    await fetch(`/api/mcp/${encodeURIComponent(name)}`, { method: 'DELETE' });
    fetchServers();
    fetchCatalog();
  };

  return (
    <div className="mb-6">
      {/* Installed servers */}
      <Card className="mb-3">
        <div className="flex items-center justify-between mb-3">
          <span className="text-[10px] text-text-muted uppercase tracking-wide">
            Installed ({servers.length})
          </span>
          <button
            onClick={() => setShowCatalog(!showCatalog)}
            className="bg-accent-blue/15 text-accent-blue border border-accent-blue/30 px-2 py-0.5 rounded text-[10px] hover:bg-accent-blue/25 transition-colors"
          >
            {showCatalog ? 'Hide Catalog' : 'Browse Catalog'}
          </button>
        </div>
        {servers.length === 0 ? (
          <div className="text-text-muted text-sm">No MCP servers configured.</div>
        ) : (
          <div className="space-y-2">
            {servers.map((server) => (
              <div
                key={server.name}
                className="flex items-center justify-between py-1.5 border-b border-border/50 last:border-0"
              >
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-accent-green" />
                  <span className="text-sm text-text-primary">{server.name}</span>
                  <span className="text-[10px] bg-border text-text-muted px-1.5 py-0.5 rounded">
                    {server.source}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-text-secondary">{server.transport}</span>
                  {server.source === 'project' && (
                    <button
                      onClick={() => handleRemove(server.name)}
                      className="text-text-muted hover:text-accent-red text-[11px] transition-colors"
                      title="Remove"
                    >
                      &times;
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Catalog */}
      {showCatalog && (
        <Card>
          <div className="text-[10px] text-text-muted uppercase tracking-wide mb-3">
            Recommended MCP Servers
          </div>
          <div className="space-y-2">
            {catalog.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between py-1.5 border-b border-border/50 last:border-0"
              >
                <div>
                  <div className="text-sm text-text-primary">{item.name}</div>
                  <div className="text-[11px] text-text-secondary">{item.description}</div>
                </div>
                {item.installed ? (
                  <span className="text-accent-green text-[10px] bg-accent-green/15 px-2 py-0.5 rounded">
                    Installed
                  </span>
                ) : (
                  <button
                    onClick={() => handleInstall(item)}
                    className="bg-accent-blue/15 text-accent-blue border border-accent-blue/30 px-2 py-0.5 rounded text-[10px] hover:bg-accent-blue/25 transition-colors"
                  >
                    Install
                  </button>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

const DOC_TYPES = [
  'audit-report',
  'stack-detection',
  'dependency-report',
  'dead-code',
  'todos',
  'type-coverage',
  'test-coverage',
  'security-report',
  'performance-report',
  'architecture',
  'api-surface',
  'changelog',
];

function DocsGrid({ audit }: { audit: AuditReport | null }) {
  const auditAny = audit as Record<string, unknown> | null;
  const generated = new Set((auditAny?.generatedDocs as string[]) ?? []);
  const timestamps = (auditAny?.docTimestamps as Record<string, string>) ?? {};
  const [generating, setGenerating] = useState(false);

  const handleGenerateAll = async () => {
    setGenerating(true);
    try {
      await fetch('/api/audit/run', { method: 'POST' });
    } catch {}
    setTimeout(() => setGenerating(false), 3000);
  };

  return (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-3">
        <span className="text-[10px] text-text-muted uppercase tracking-wide">
          {generated.size} of {DOC_TYPES.length} generated
        </span>
        <button
          onClick={handleGenerateAll}
          disabled={generating}
          className="bg-accent-blue/15 text-accent-blue border border-accent-blue/30 px-3 py-1 rounded-md text-[11px] hover:bg-accent-blue/25 transition-colors disabled:opacity-40"
        >
          {generating ? 'Generating...' : 'Generate All'}
        </button>
      </div>
      <div className="grid grid-cols-3 gap-3">
        {DOC_TYPES.map((doc) => {
          const exists = generated.has(doc);
          const ts = timestamps[doc];
          const stale = ts ? Date.now() - new Date(ts).getTime() > 7 * 24 * 3600 * 1000 : false;

          return (
            <Card key={doc} className="!p-3">
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm text-text-primary">{doc}</span>
                <span
                  className={`w-2 h-2 rounded-full ${
                    !exists ? 'bg-text-muted' : stale ? 'bg-accent-amber' : 'bg-accent-green'
                  }`}
                />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-text-muted">
                  {!exists ? 'Not generated' : stale ? 'Stale' : 'Fresh'}
                  {ts && ` — ${new Date(ts).toLocaleDateString()}`}
                </span>
                {(!exists || stale) && (
                  <button
                    onClick={handleGenerateAll}
                    className="text-[9px] text-accent-blue hover:underline"
                  >
                    Generate
                  </button>
                )}
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="text-sm font-semibold text-text-secondary mb-3">{children}</h2>;
}

function RecommendationsList({
  recommendations,
}: {
  recommendations: Array<Record<string, unknown>>;
}) {
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);

  return (
    <div className="space-y-2 mb-6">
      {recommendations.map((rec, i) => {
        const severity = (rec.severity || rec.type) as string;
        const title = (rec.title || rec.message) as string;
        const detail = rec.detail as string | undefined;
        const fix = rec.fix as string | undefined;
        const expanded = expandedIdx === i;

        return (
          <div key={i} className="bg-bg-surface border border-border rounded-lg overflow-hidden">
            <button
              className="flex items-center gap-2 px-4 py-3 w-full text-left hover:bg-bg-hover transition-colors"
              onClick={() => setExpandedIdx(expanded ? null : i)}
              aria-expanded={expanded}
            >
              <span
                className={`text-[10px] px-1.5 py-0.5 rounded shrink-0 ${
                  severity === 'warning'
                    ? 'bg-accent-amber/20 text-accent-amber'
                    : severity === 'critical'
                      ? 'bg-accent-red/20 text-accent-red'
                      : 'bg-accent-blue/20 text-accent-blue'
                }`}
              >
                {severity}
              </span>
              <span className="text-sm text-text-primary flex-1">{title}</span>
              <span className="text-text-muted text-[11px] shrink-0">{expanded ? '▲' : '▼'}</span>
            </button>
            {expanded && (detail || fix) && (
              <div className="px-4 py-3 border-t border-border bg-bg-primary space-y-3">
                {detail && (
                  <div className="text-sm text-text-secondary whitespace-pre-wrap">{detail}</div>
                )}
                {fix && (
                  <div className="text-[11px]">
                    <span className="text-text-muted">Suggestion: </span>
                    <span className="text-text-secondary">{fix}</span>
                  </div>
                )}
                <CopyCommand title={title} detail={detail} fix={fix} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// #5 Context Optimization
function ContextPanel() {
  const [status, setStatus] = useState<{
    enabled?: boolean;
    stats?: Record<string, unknown>;
  } | null>(null);
  useEffect(() => {
    fetch('/api/context/status')
      .then((r) => r.json())
      .then(setStatus)
      .catch(() => {});
  }, []);

  return (
    <>
      <SectionTitle>Context Optimization</SectionTitle>
      <Card className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="text-lg">🧠</span>
            <span className="text-sm text-text-primary">Context Engine</span>
          </div>
          <span
            className={`text-[10px] px-2 py-0.5 rounded ${status?.enabled ? 'bg-accent-green/15 text-accent-green' : 'bg-border text-text-muted'}`}
          >
            {status?.enabled ? 'Enabled' : 'Disabled'}
          </span>
        </div>
        <div className="text-[11px] text-text-secondary mb-2">
          Smart context management — knowledge base, session continuity, token budget optimization.
        </div>
        {!status?.enabled && (
          <div className="text-[10px] text-text-muted">
            Enable:{' '}
            <code className="bg-bg-hover px-1.5 py-0.5 rounded text-accent-blue">
              npx erne-universal dashboard --context
            </code>
          </div>
        )}
        {status?.enabled && status?.stats && (
          <div className="grid grid-cols-3 gap-2 mt-2">
            {Object.entries(status.stats)
              .slice(0, 6)
              .map(([k, v]) => (
                <div key={k} className="text-[10px]">
                  <span className="text-text-muted">{k}: </span>
                  <span className="text-text-primary">{String(v)}</span>
                </div>
              ))}
          </div>
        )}
      </Card>
    </>
  );
}

function InfoRow({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex items-center justify-between py-1 text-sm">
      <span className="text-text-secondary">{label}</span>
      <span className="text-text-primary">{value ?? '—'}</span>
    </div>
  );
}
