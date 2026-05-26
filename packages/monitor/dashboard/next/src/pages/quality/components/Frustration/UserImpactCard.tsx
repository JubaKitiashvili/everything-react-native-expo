// Task 117.23 — Frustration panel hero card.
//
// Renders the lead "this button causes errors for X% of users" sentence
// in a critical-tinted card. When there's nothing alarming to surface
// the card downgrades to a quiet variant rather than fabricating drama.

import type { ComponentImpact, FrustrationHeadline } from './aggregate';
import styles from './Frustration.module.css';

export interface UserImpactCardProps {
  headline: FrustrationHeadline;
  /** Total distinct sessions feeding the % — rendered alongside as `(of N users)`. */
  totalSessions: number;
  /** Top impact row when present — pulls extra stats into the hero footer. */
  topImpact: ComponentImpact | null;
}

export function UserImpactCard({ headline, totalSessions, topImpact }: UserImpactCardProps) {
  const isQuiet = headline.componentPath === null || headline.errorTapCount === 0;
  const cardClass = `${styles.hero}${isQuiet ? ` ${styles.heroQuiet}` : ''}`;
  const eyebrowClass = `${styles.heroEyebrow}${isQuiet ? ` ${styles.heroEyebrowQuiet}` : ''}`;

  return (
    <div className={cardClass} role="region" aria-label="User impact headline">
      <span className={eyebrowClass}>
        {isQuiet ? 'Frustration overview' : 'User impact alert'}
      </span>
      <h3 className={styles.heroHeadline}>{headline.text}</h3>
      <div className={styles.heroFooter}>
        <span className={styles.heroStat}>
          <span className={styles.heroStatValue}>
            {Math.round(headline.userImpactPct * 100)}%
          </span>
          of {totalSessions} session{totalSessions === 1 ? '' : 's'} affected
        </span>
        {topImpact ? (
          <>
            <span className={styles.heroStat}>
              <span className={styles.heroStatValue}>{topImpact.errorTapCount}</span> error tap
              {topImpact.errorTapCount === 1 ? '' : 's'}
            </span>
            <span className={styles.heroStat}>
              <span className={styles.heroStatValue}>{topImpact.rageTapCount}</span> rage tap
              {topImpact.rageTapCount === 1 ? '' : 's'}
            </span>
          </>
        ) : null}
      </div>
    </div>
  );
}
