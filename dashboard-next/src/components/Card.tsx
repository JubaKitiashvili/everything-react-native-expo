import type { ReactNode } from 'react';

interface CardProps {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
}

export function Card({ children, className = '', onClick }: CardProps) {
  const baseClasses = `bg-bg-surface border border-border rounded-2xl p-5 transition-all duration-200 ${className}`;

  if (onClick) {
    return (
      <button
        className={`${baseClasses} cursor-pointer hover:bg-bg-hover hover:border-border-light hover:-translate-y-0.5 hover:shadow-[0_4px_16px_rgba(0,0,0,0.4)] w-full text-left`}
        onClick={onClick}
      >
        {children}
      </button>
    );
  }

  return <div className={baseClasses}>{children}</div>;
}

interface StatCardProps {
  label: string;
  value: string | number;
  sub?: string;
  color?: string;
}

export function StatCard({ label, value, sub, color = 'text-text-primary' }: StatCardProps) {
  return (
    <Card>
      <div className="text-text-secondary text-xs uppercase tracking-wide">{label}</div>
      <div className={`text-2xl font-bold mt-1.5 ${color}`}>{value}</div>
      {sub && <div className="text-xs mt-1 text-text-muted">{sub}</div>}
    </Card>
  );
}
