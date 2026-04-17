import { type ReactNode } from 'react';
import styles from './FilterBar.module.css';

export interface FilterBarProps {
  children: ReactNode;
  sticky?: boolean;
  ariaLabel?: string;
}

export function FilterBar({ children, sticky = false, ariaLabel = 'Filters' }: FilterBarProps) {
  return (
    <div
      className={[styles.bar, sticky ? styles.sticky : null].filter(Boolean).join(' ')}
      role="toolbar"
      aria-label={ariaLabel}
    >
      {children}
    </div>
  );
}
