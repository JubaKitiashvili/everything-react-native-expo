import { type ReactNode } from 'react';
import { type Severity } from '../../../tokens';
import styles from './Pill.module.css';

export interface PillProps {
  children: ReactNode;
  severity?: Severity;
  size?: 'sm' | 'md';
  interactive?: boolean;
  ariaLabel?: string;
  onClick?: () => void;
}

function severityClass(severity: Severity): string {
  switch (severity) {
    case 'critical':
      return styles.critical ?? '';
    case 'warning':
      return styles.warning ?? '';
    case 'info':
      return styles.info ?? '';
    case 'success':
      return styles.success ?? '';
    case 'muted':
      return styles.muted ?? '';
  }
}

export function Pill({
  children,
  severity = 'muted',
  size = 'md',
  interactive = false,
  ariaLabel,
  onClick,
}: PillProps) {
  const className = [
    styles.pill,
    severityClass(severity),
    size === 'sm' ? styles.sizeSm : styles.sizeMd,
    interactive ? styles.interactive : null,
  ]
    .filter(Boolean)
    .join(' ');

  if (onClick) {
    return (
      <button
        type="button"
        className={className}
        onClick={onClick}
        aria-label={ariaLabel}
        data-severity={severity}
      >
        {children}
      </button>
    );
  }

  return (
    <span className={className} aria-label={ariaLabel} data-severity={severity}>
      {children}
    </span>
  );
}
