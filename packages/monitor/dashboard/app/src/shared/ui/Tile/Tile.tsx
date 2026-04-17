import { type ReactNode } from 'react';
import { type Severity } from '../../../tokens';
import styles from './Tile.module.css';

export type DeltaDirection = 'up' | 'down' | 'flat';

export interface TileProps {
  label: string;
  value: ReactNode;
  delta?: string;
  deltaDirection?: DeltaDirection;
  deltaSeverity?: Severity;
  trend?: ReactNode;
  onClick?: () => void;
  ariaLabel?: string;
}

const arrow: Record<DeltaDirection, string> = {
  up: '▲',
  down: '▼',
  flat: '■',
};

export function Tile({
  label,
  value,
  delta,
  deltaDirection = 'flat',
  deltaSeverity = 'muted',
  trend,
  onClick,
  ariaLabel,
}: TileProps) {
  const className = [styles.tile, onClick ? styles.clickable : null].filter(Boolean).join(' ');

  const content = (
    <>
      <div className={styles.top}>
        <span className={styles.label}>{label}</span>
        {trend ? <span className={styles.trend}>{trend}</span> : null}
      </div>
      <div className={styles.value}>{value}</div>
      {delta ? (
        <div className={styles.delta} data-severity={deltaSeverity} data-direction={deltaDirection}>
          <span className={styles.deltaArrow} aria-hidden="true">
            {arrow[deltaDirection]}
          </span>
          <span>{delta}</span>
        </div>
      ) : null}
    </>
  );

  if (onClick) {
    return (
      <button type="button" className={className} onClick={onClick} aria-label={ariaLabel ?? label}>
        {content}
      </button>
    );
  }

  return (
    <div className={className} aria-label={ariaLabel}>
      {content}
    </div>
  );
}
