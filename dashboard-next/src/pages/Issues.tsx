import { useState, useMemo, useEffect, useCallback } from 'react';
import { Badge } from '../components/Badge';
import { Card } from '../components/Card';
import { CopyCommand } from '../components/CopyCommand';
import { findingsToIssues, depsToIssues, sortIssues } from '../lib/issues';
import type { AuditReport, Issue } from '../types';

type WsHandler = (
  handler: (msg: {
    type: string;
    findingId?: string;
    line?: string;
    success?: boolean;
    output?: string;
  }) => void,
) => () => void;

interface IssuesProps {
  audit: AuditReport | null;
  upgrades: { packages?: Array<{ name: string; current: string; latest: string; type: string }> };
  refetchAudit: () => void;
  onWsMessage: WsHandler;
}

export function Issues({ audit, upgrades, refetchAudit, onWsMessage }: IssuesProps) {
  const [severityFilter, setSeverityFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [fixOutput, setFixOutput] = useState<Record<string, string[]>>({});
  const [fixingIds, setFixingIds] = useState<Set<string>>(new Set());
  const [fixMode, setFixMode] = useState<'agent' | 'direct'>('direct');

  // Check fix capabilities on mount
  useEffect(() => {
    fetch('/api/issues/fix-capabilities')
      .then((r) => r.json())
      .then((d) => setFixMode(d.agentFix ? 'agent' : 'direct'))
      .catch(() => {});
  }, []);

  // Listen for fix output/complete via WebSocket
  useEffect(() => {
    const unsubscribe = onWsMessage((msg) => {
      if (msg.type === 'fix_output' && msg.findingId && msg.line) {
        setFixOutput((prev) => ({
          ...prev,
          [msg.findingId!]: [...(prev[msg.findingId!] ?? []), msg.line!],
        }));
      }
      if (msg.type === 'fix_complete' && msg.findingId) {
        setFixingIds((prev) => {
          const next = new Set(prev);
          next.delete(msg.findingId!);
          return next;
        });
        if (msg.success) {
          setTimeout(refetchAudit, 1000);
        }
      }
    });
    return unsubscribe;
  }, [onWsMessage, refetchAudit]);

  const handleFix = useCallback(
    async (issue: Issue) => {
      setFixingIds((prev) => new Set(prev).add(issue.id));
      setFixOutput((prev) => ({ ...prev, [issue.id]: [] }));
      setExpandedId(issue.id);
      try {
        const body =
          fixMode === 'agent'
            ? {
                findingId: issue.id,
                fix: issue.fix,
                issue: {
                  title: issue.title,
                  detail: issue.detail,
                  category: issue.category,
                  severity: issue.severity,
                  fix: issue.fix,
                },
                mode: 'agent',
              }
            : { findingId: issue.id, fix: issue.fix };
        const res = await fetch('/api/issues/fix', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error('Fix request failed');
      } catch {
        setFixingIds((prev) => {
          const next = new Set(prev);
          next.delete(issue.id);
          return next;
        });
        setFixOutput((prev) => ({
          ...prev,
          [issue.id]: [...(prev[issue.id] ?? []), 'Error: Fix request failed\n'],
        }));
      }
    },
    [fixMode],
  );

  const allIssues = useMemo(() => {
    const auditIssues = audit?.findings ? findingsToIssues(audit.findings) : [];
    const depIssues = upgrades?.packages
      ? depsToIssues(
          upgrades.packages.map((p) => ({ ...p, type: p.type as 'major' | 'minor' | 'patch' })),
        )
      : [];
    return sortIssues([...auditIssues, ...depIssues]);
  }, [audit, upgrades]);

  const filteredIssues = useMemo(() => {
    return allIssues.filter((issue) => {
      if (severityFilter !== 'all' && issue.severity !== severityFilter) return false;
      if (categoryFilter !== 'all' && issue.category !== categoryFilter) return false;
      return true;
    });
  }, [allIssues, severityFilter, categoryFilter]);

  const counts = useMemo(
    () => ({
      all: allIssues.length,
      critical: allIssues.filter((i) => i.severity === 'critical').length,
      warning: allIssues.filter((i) => i.severity === 'warning').length,
      info: allIssues.filter((i) => i.severity === 'info').length,
    }),
    [allIssues],
  );

  const categories = useMemo(() => {
    const cats = new Set(allIssues.map((i) => i.category));
    return Array.from(cats);
  }, [allIssues]);

  const handleRunAudit = async () => {
    try {
      const res = await fetch('/api/audit/run', { method: 'POST' });
      if (res.ok) setTimeout(refetchAudit, 1000);
    } catch {
      // Server unreachable
    }
  };

  return (
    <div className="p-6 w-full">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <h1 className="text-lg font-semibold">Issues</h1>
          <span className="bg-border text-text-secondary px-2 py-0.5 rounded-full text-[11px]">
            {allIssues.length}
          </span>
        </div>
        <button
          onClick={handleRunAudit}
          className="bg-accent-green/15 text-accent-green border border-accent-green/30 px-3 py-1 rounded-md text-[11px] hover:bg-accent-green/25 transition-colors"
        >
          Run Audit
        </button>
      </div>

      {/* Filter pills */}
      <div className="flex gap-1.5 mb-4 flex-wrap">
        <FilterPill
          active={severityFilter === 'all'}
          onClick={() => setSeverityFilter('all')}
          color="text-accent-blue"
        >
          All ({counts.all})
        </FilterPill>
        <FilterPill
          active={severityFilter === 'critical'}
          onClick={() => setSeverityFilter('critical')}
          color="text-accent-red"
        >
          Critical ({counts.critical})
        </FilterPill>
        <FilterPill
          active={severityFilter === 'warning'}
          onClick={() => setSeverityFilter('warning')}
          color="text-accent-amber"
        >
          Warning ({counts.warning})
        </FilterPill>
        <FilterPill
          active={severityFilter === 'info'}
          onClick={() => setSeverityFilter('info')}
          color="text-accent-blue"
        >
          Info ({counts.info})
        </FilterPill>
        <span className="text-border-light px-1 self-center">|</span>
        <FilterPill
          active={categoryFilter === 'all'}
          onClick={() => setCategoryFilter('all')}
          color="text-text-secondary"
        >
          All Categories
        </FilterPill>
        {categories.map((cat) => (
          <FilterPill
            key={cat}
            active={categoryFilter === cat}
            onClick={() => setCategoryFilter(cat)}
            color="text-text-secondary"
          >
            {cat}
          </FilterPill>
        ))}
      </div>

      {/* Issue list */}
      <div className="space-y-2">
        {filteredIssues.length === 0 ? (
          <Card>
            <div className="text-text-muted text-sm text-center py-4">
              {allIssues.length === 0
                ? 'No issues found. Run an audit to check your project.'
                : 'No issues match filters.'}
            </div>
          </Card>
        ) : (
          filteredIssues.map((issue) => (
            <IssueRow
              key={issue.id}
              issue={issue}
              expanded={expandedId === issue.id}
              onToggle={() => setExpandedId(expandedId === issue.id ? null : issue.id)}
              onFix={() => handleFix(issue)}
              fixing={fixingIds.has(issue.id)}
              output={fixOutput[issue.id]}
              fixMode={fixMode}
            />
          ))
        )}
      </div>
    </div>
  );
}

function FilterPill({
  active,
  onClick,
  color,
  children,
}: {
  active: boolean;
  onClick: () => void;
  color: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-2.5 py-1 rounded-full text-[11px] border transition-colors ${
        active
          ? `bg-accent-blue/15 ${color} border-accent-blue/40`
          : `bg-bg-surface ${color} border-border hover:border-border-light`
      }`}
    >
      {children}
    </button>
  );
}

function IssueRow({
  issue,
  expanded,
  onToggle,
  onFix,
  fixing,
  output,
  fixMode,
}: {
  issue: Issue;
  expanded: boolean;
  onToggle: () => void;
  onFix: () => void;
  fixing: boolean;
  output?: string[];
  fixMode: 'agent' | 'direct';
}) {
  return (
    <div className="bg-bg-surface border border-border rounded-lg overflow-hidden">
      <button
        className="flex items-center gap-3 px-4 py-3 w-full text-left hover:bg-bg-hover transition-colors"
        onClick={onToggle}
        aria-expanded={expanded}
      >
        <Badge severity={issue.severity} />
        <div className="flex-1 min-w-0">
          <div className="text-sm text-text-primary truncate">{issue.title}</div>
          <div className="text-[10px] text-text-muted mt-0.5">
            {issue.category} &bull; {issue.source}
          </div>
        </div>
        {issue.isExecutable ? (
          <span
            role="button"
            tabIndex={0}
            onClick={(e) => {
              e.stopPropagation();
              onFix();
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                e.stopPropagation();
                onFix();
              }
            }}
            className={`px-2 py-0.5 rounded text-[10px] border transition-colors whitespace-nowrap ${
              fixing
                ? 'bg-accent-amber/15 text-accent-amber border-accent-amber/30 animate-pulse'
                : 'bg-accent-green/15 text-accent-green border-accent-green/30 hover:bg-accent-green/25'
            }`}
          >
            {fixing
              ? fixMode === 'agent'
                ? 'Agent fixing...'
                : 'Fixing...'
              : fixMode === 'agent'
                ? 'Agent Fix'
                : 'Fix'}
          </span>
        ) : fixMode === 'agent' ? (
          <span
            role="button"
            tabIndex={0}
            onClick={(e) => {
              e.stopPropagation();
              onFix();
            }}
            className="px-2 py-0.5 rounded text-[10px] border bg-accent-purple/15 text-accent-purple border-accent-purple/30 hover:bg-accent-purple/25 transition-colors whitespace-nowrap"
          >
            Agent Fix
          </span>
        ) : (
          <span className="text-text-muted text-[10px]">Copy to AI</span>
        )}
      </button>
      {expanded && (
        <div className="px-4 py-3 border-t border-border bg-bg-primary space-y-3">
          <div className="text-sm text-text-secondary">{issue.detail}</div>
          <CopyCommand title={issue.title} detail={issue.detail} fix={issue.fix} />
          {output && output.length > 0 && (
            <div className="bg-bg-surface border border-border rounded p-2 max-h-[150px] overflow-y-auto">
              <div className="text-[10px] text-text-muted uppercase tracking-wide mb-1">Output</div>
              <pre className="text-[11px] text-text-secondary whitespace-pre-wrap font-mono">
                {output.join('')}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
