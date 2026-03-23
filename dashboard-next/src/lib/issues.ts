import type { AuditFinding, Issue, UpgradePackage } from '../types';

function hashId(category: string, title: string, index: number): string {
  let hash = 0;
  const str = `${category}:${title}`;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return `f-${Math.abs(hash).toString(36)}-${index}`;
}

function isExecutableCommand(fix: string): boolean {
  const trimmed = fix.trim().toLowerCase();
  return (
    trimmed.startsWith('npm ') ||
    trimmed.startsWith('npx ') ||
    trimmed.startsWith('node ')
  );
}

export function findingsToIssues(findings: AuditFinding[]): Issue[] {
  return findings.map((f, i) => ({
    id: hashId(f.category, f.title, i),
    severity: f.severity,
    category: mapCategory(f.category),
    title: f.title,
    detail: f.detail,
    fix: f.fix,
    source: mapSource(f.category),
    isExecutable: isExecutableCommand(f.fix),
  }));
}

export function depsToIssues(packages: UpgradePackage[]): Issue[] {
  return packages.map((p, i) => ({
    id: hashId('Dependencies', p.name, 1000 + i),
    severity: p.type === 'major' ? 'warning' : 'info',
    category: 'Dependencies',
    title: `${p.name} ${p.current} → ${p.latest}`,
    detail: `${p.type} update available`,
    fix: `npm install ${p.name}@${p.latest}`,
    source: 'deps' as const,
    isExecutable: true,
  }));
}

function mapCategory(cat: string): string {
  const lower = cat.toLowerCase();
  if (lower.includes('secur')) return 'Security';
  if (lower.includes('perf')) return 'Performance';
  if (lower.includes('dep')) return 'Dependencies';
  return 'Quality';
}

function mapSource(cat: string): Issue['source'] {
  const lower = cat.toLowerCase();
  if (lower.includes('secur')) return 'security';
  if (lower.includes('perf')) return 'performance';
  if (lower.includes('dep')) return 'deps';
  return 'audit';
}

export function sortIssues(issues: Issue[]): Issue[] {
  const order: Record<string, number> = { critical: 0, warning: 1, info: 2 };
  return [...issues].sort(
    (a, b) => (order[a.severity] ?? 3) - (order[b.severity] ?? 3)
  );
}
