interface BadgeProps {
  severity: 'critical' | 'warning' | 'info';
  children?: React.ReactNode;
}

const severityStyles: Record<string, string> = {
  critical: 'bg-accent-red/15 text-accent-red',
  warning: 'bg-accent-amber/15 text-accent-amber',
  info: 'bg-accent-blue/15 text-accent-blue',
};

export function Badge({ severity, children }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold min-w-[48px] justify-center ${severityStyles[severity] ?? ''}`}
    >
      {children ?? severity}
    </span>
  );
}

interface StatusDotProps {
  status: string;
  className?: string;
}

const statusColors: Record<string, string> = {
  working: 'bg-accent-green shadow-[0_0_6px_rgba(48,209,88,0.5)]',
  planning: 'bg-accent-purple shadow-[0_0_6px_rgba(191,90,242,0.5)]',
  done: 'bg-accent-blue shadow-[0_0_6px_rgba(10,132,255,0.5)]',
  idle: 'bg-text-muted',
};

export function StatusDot({ status, className = '' }: StatusDotProps) {
  return (
    <span
      className={`inline-block w-2 h-2 rounded-full ${statusColors[status] ?? statusColors.idle} ${className}`}
    />
  );
}
