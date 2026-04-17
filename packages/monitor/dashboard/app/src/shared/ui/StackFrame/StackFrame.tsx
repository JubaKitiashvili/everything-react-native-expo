import { parseLocation } from './parseLocation';
import styles from './StackFrame.module.css';

export interface StackFrameProps {
  symbol: string;
  location?: string;
  resolved?: boolean;
  onClick?: () => void;
}

export function StackFrame({ symbol, location, resolved = false, onClick }: StackFrameProps) {
  const parsed = location ? parseLocation(location) : null;
  const className = [
    styles.frame,
    resolved ? styles.resolved : styles.unresolved,
    onClick ? styles.clickable : null,
  ]
    .filter(Boolean)
    .join(' ');

  const body = (
    <>
      <span className={styles.symbol}>{symbol}</span>
      {parsed ? (
        <span className={styles.location}>
          <span className={styles.file}>{parsed.file}</span>
          {parsed.line !== undefined ? (
            <span className={styles.lineCol}>
              :{parsed.line}
              {parsed.column !== undefined ? `:${parsed.column}` : ''}
            </span>
          ) : null}
        </span>
      ) : null}
    </>
  );

  if (onClick) {
    return (
      <button type="button" className={className} onClick={onClick}>
        {body}
      </button>
    );
  }

  return <div className={className}>{body}</div>;
}
