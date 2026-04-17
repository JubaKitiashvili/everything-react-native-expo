import { type ReactNode } from 'react';
import styles from './Panel.module.css';

export interface PanelProps {
  title?: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  density?: 'compact' | 'default';
  bleed?: boolean;
  children: ReactNode;
}

export function Panel({
  title,
  description,
  action,
  density = 'default',
  bleed = false,
  children,
}: PanelProps) {
  const hasHeader = Boolean(title || description || action);
  return (
    <section
      className={[styles.panel, density === 'compact' ? styles.compact : null]
        .filter(Boolean)
        .join(' ')}
      data-density={density}
    >
      {hasHeader ? (
        <header className={styles.header}>
          <div className={styles.headerText}>
            {title ? <h2 className={styles.title}>{title}</h2> : null}
            {description ? <p className={styles.description}>{description}</p> : null}
          </div>
          {action ? <div className={styles.action}>{action}</div> : null}
        </header>
      ) : null}
      <div className={bleed ? styles.bodyBleed : styles.body}>{children}</div>
    </section>
  );
}
