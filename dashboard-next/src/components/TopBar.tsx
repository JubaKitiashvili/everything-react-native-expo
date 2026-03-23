interface TopBarProps {
  projectName: string;
  activeAgents: number;
  healthScore: number | null;
  issueCount: number;
  connected: boolean;
}

export function TopBar({
  projectName,
  activeAgents,
  healthScore,
  issueCount,
  connected,
}: TopBarProps) {
  return (
    <header className="h-12 min-h-12 bg-bg-surface/80 backdrop-blur-xl border-b border-border flex items-center justify-between px-5">
      <div className="flex items-center gap-4">
        <span className="text-accent-blue font-semibold text-sm tracking-tight">ERNE</span>
        <span className="text-text-primary text-sm font-medium">{projectName}</span>
        <div className="h-3 w-px bg-border" />
        <span className="flex items-center gap-2 text-xs">
          {connected ? (
            <span className="w-2 h-2 rounded-full bg-accent-green shadow-[0_0_6px_rgba(48,209,88,0.5)]" />
          ) : (
            <span className="w-2 h-2 rounded-full bg-accent-red animate-pulse" />
          )}
          <span className={connected ? 'text-text-secondary' : 'text-accent-red'}>
            {connected
              ? `${activeAgents} agent${activeAgents !== 1 ? 's' : ''} active`
              : 'Disconnected'}
          </span>
        </span>
      </div>
      <div className="flex items-center gap-3">
        {healthScore !== null && (
          <span className="bg-accent-green/10 text-accent-green px-3 py-1 rounded-full text-xs font-medium">
            Score {healthScore}
          </span>
        )}
        {issueCount > 0 && (
          <span className="bg-accent-amber/10 text-accent-amber px-3 py-1 rounded-full text-xs font-medium">
            {issueCount} issue{issueCount !== 1 ? 's' : ''}
          </span>
        )}
      </div>
    </header>
  );
}
