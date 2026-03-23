import { useState, useEffect } from 'react';
import { Card } from '../components/Card';

const PROFILES = [
  {
    id: 'minimal',
    icon: '⚡',
    name: 'minimal',
    desc: 'No blocking hooks. Max speed.',
    features: ['Basic lint', 'No blocking', 'Fast iteration'],
  },
  {
    id: 'standard',
    icon: '⚖️',
    name: 'standard',
    rec: true,
    desc: 'Balanced quality + speed.',
    features: ['Platform checks', 'Security scan', 'Bundle monitor'],
  },
  {
    id: 'strict',
    icon: '🛡️',
    name: 'strict',
    desc: 'Production-grade enforcement.',
    features: ['Type checking', 'A11y audits', 'Perf budgets'],
  },
];

const IDE_CONFIGS = [
  { id: 'cursor', name: 'Cursor', file: '.cursorrules', icon: '⚡' },
  { id: 'windsurf', name: 'Windsurf', file: '.windsurfrules', icon: '🏄' },
  { id: 'copilot', name: 'GitHub Copilot', file: 'AGENTS.md', icon: '🤖' },
  { id: 'gemini', name: 'Gemini', file: 'GEMINI.md', icon: '💎' },
];

export function Settings() {
  return (
    <div className="p-6 w-full">
      <h1 className="text-lg font-semibold mb-6">Settings</h1>

      <SectionTitle>Hook Profiles</SectionTitle>
      <HookProfiles />

      <SectionTitle>IDE Config Sync</SectionTitle>
      <IdeSyncPanel />

      <SectionTitle>Context Optimization</SectionTitle>
      <ContextPanel />
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-sm font-semibold text-text-secondary mb-3 mt-6 first:mt-0">{children}</h2>
  );
}

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

function IdeSyncPanel() {
  const [copied, setCopied] = useState(false);
  const cmd = 'npx erne-universal sync-configs';
  return (
    <Card className="mb-6">
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="text-sm text-text-primary mb-1">
            Sync CLAUDE.md rules to other AI tools
          </div>
          <div className="text-[11px] text-text-secondary">
            Automatically generate config files for Cursor, Windsurf, Copilot, and Gemini
          </div>
        </div>
        <button
          onClick={() => {
            navigator.clipboard.writeText(cmd);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
          className={`text-[10px] px-3 py-1 rounded-md transition-colors shrink-0 ${copied ? 'bg-accent-green/15 text-accent-green' : 'bg-accent-blue/15 text-accent-blue border border-accent-blue/30 hover:bg-accent-blue/25'}`}
        >
          {copied ? 'Copied!' : 'Copy Command'}
        </button>
      </div>
      <div className="grid grid-cols-4 gap-3">
        {IDE_CONFIGS.map((ide) => (
          <div key={ide.id} className="flex items-center gap-3 p-3 border border-border rounded-lg">
            <span className="text-xl">{ide.icon}</span>
            <div>
              <div className="text-sm text-text-primary">{ide.name}</div>
              <div className="text-[10px] text-text-muted font-mono">{ide.file}</div>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

interface ContextStats {
  sessionEvents?: number;
  knowledgeEntries?: number;
  contextSaved?: number;
  bytesUsed?: number;
  bytesSaved?: number;
}

interface BudgetSettings {
  maxTokens?: number;
  tier?: string;
}

function ContextPanel() {
  const [status, setStatus] = useState<{ enabled?: boolean } | null>(null);
  const [stats, setStats] = useState<ContextStats | null>(null);
  const [budget, setBudget] = useState<BudgetSettings | null>(null);
  const [knowledge, setKnowledge] = useState<
    Array<{ key?: string; value?: string; relevance?: number }>
  >([]);

  useEffect(() => {
    fetch('/api/context/status')
      .then((r) => r.json())
      .then(setStatus)
      .catch(() => {});
    fetch('/api/context/stats')
      .then((r) => r.json())
      .then((d) => setStats(d?.data || d))
      .catch(() => {});
    fetch('/api/context/budget')
      .then((r) => r.json())
      .then((d) => setBudget(d?.data || d))
      .catch(() => {});
    fetch('/api/context/knowledge')
      .then((r) => r.json())
      .then((d) => setKnowledge((d?.data || d?.entries || []).slice(0, 8)))
      .catch(() => {});
  }, []);

  const enabled = status?.enabled;

  return (
    <div className="space-y-4 mb-6">
      {/* Status header */}
      <Card>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-2xl">🧠</span>
            <div>
              <div className="text-sm font-semibold text-text-primary">Context Engine</div>
              <div className="text-[11px] text-text-secondary">
                Persistent knowledge across sessions — agents remember patterns, decisions, and
                project conventions.
              </div>
            </div>
          </div>
          <span
            className={`text-[10px] px-2.5 py-1 rounded-md ${enabled ? 'bg-accent-green/15 text-accent-green' : 'bg-border text-text-muted'}`}
          >
            {enabled ? 'Enabled' : 'Disabled'}
          </span>
        </div>
        {!enabled && (
          <div className="mt-3 p-3 bg-bg-hover rounded-lg text-[11px] text-text-muted">
            Enable context features:{' '}
            <code className="bg-bg-primary px-1.5 py-0.5 rounded text-accent-blue">
              npx erne-universal dashboard --context
            </code>
          </div>
        )}
      </Card>

      {/* Feature cards */}
      <div className="grid grid-cols-3 gap-3">
        {/* Knowledge Base */}
        <Card>
          <div className="flex items-center gap-2 mb-2">
            <span>📚</span>
            <span className="text-sm font-semibold text-text-primary">Knowledge Base</span>
          </div>
          <div className="text-[11px] text-text-secondary mb-3">
            FTS5-indexed storage. Agents save patterns, decisions, and conventions — searchable
            across sessions.
          </div>
          {knowledge.length > 0 ? (
            <div className="space-y-1.5">
              {knowledge.map((k, i) => (
                <div
                  key={i}
                  className="text-[10px] p-1.5 bg-bg-hover rounded flex items-center justify-between"
                >
                  <span className="text-text-primary truncate flex-1">
                    {k.key || k.value || '...'}
                  </span>
                  {k.relevance !== undefined && (
                    <span className="text-text-muted ml-2 shrink-0">{k.relevance}%</span>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="text-[10px] text-text-muted">
              {enabled
                ? 'No entries yet — agents will populate this as they work.'
                : 'Enable context to use.'}
            </div>
          )}
        </Card>

        {/* Session Continuity */}
        <Card>
          <div className="flex items-center gap-2 mb-2">
            <span>🔄</span>
            <span className="text-sm font-semibold text-text-primary">Session Continuity</span>
          </div>
          <div className="text-[11px] text-text-secondary mb-3">
            Snapshots save session state before compaction. Next session restores context — no lost
            work.
          </div>
          {stats ? (
            <div className="space-y-2">
              <StatRow label="Session events" value={stats.sessionEvents ?? 0} />
              <StatRow
                label="Context saved"
                value={stats.contextSaved ? `${stats.contextSaved}%` : '—'}
              />
              <StatRow
                label="Bytes saved"
                value={stats.bytesSaved ? formatBytes(stats.bytesSaved) : '—'}
              />
            </div>
          ) : (
            <div className="text-[10px] text-text-muted">
              {enabled ? 'Loading...' : 'Enable context to use.'}
            </div>
          )}
        </Card>

        {/* Token Budget */}
        <Card>
          <div className="flex items-center gap-2 mb-2">
            <span>💰</span>
            <span className="text-sm font-semibold text-text-primary">Token Budget</span>
          </div>
          <div className="text-[11px] text-text-secondary mb-3">
            Smart truncation keeps context within limits. 14 content types prioritized by relevance.
          </div>
          {budget ? (
            <div className="space-y-2">
              <StatRow
                label="Max tokens"
                value={budget.maxTokens ? budget.maxTokens.toLocaleString() : '—'}
              />
              <StatRow label="Tier" value={budget.tier || 'auto'} />
              <StatRow label="Knowledge entries" value={stats?.knowledgeEntries ?? 0} />
            </div>
          ) : (
            <div className="text-[10px] text-text-muted">
              {enabled ? 'Loading...' : 'Enable context to use.'}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

function StatRow({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-center justify-between text-[10px]">
      <span className="text-text-muted">{label}</span>
      <span className="text-text-primary font-mono">{value}</span>
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / 1048576).toFixed(1)}MB`;
}
