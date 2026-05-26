import { Sparkline, Tile } from '@/shared/ui';
import { LiveFeed } from './components/LiveFeed';
import { DORA } from './components/DORA';
import { AIInsights } from './components/AIInsights';
import styles from './OverviewPage.module.css';

/**
 * Landing page: at-a-glance KPI tiles, the live event feed, DORA delivery
 * metrics, and the AI insights summary. The deep panels (crashes, ANRs,
 * performance, …) each live on their own route.
 */
export function OverviewPage() {
  return (
    <div className={styles.page}>
      <section className={styles.tiles} aria-label="Key metrics">
        <Tile
          label="Crashes / 24h"
          value="—"
          trend={<Sparkline data={[0, 0, 0, 0, 0]} color="#ff5a5f" />}
        />
        <Tile
          label="ANRs / 24h"
          value="—"
          trend={<Sparkline data={[0, 0, 0, 0, 0]} color="#fbbf24" />}
        />
        <Tile
          label="P95 TTI"
          value="—"
          trend={<Sparkline data={[0, 0, 0, 0, 0]} color="#60a5fa" />}
        />
        <Tile label="Events / min" value="—" trend={<Sparkline data={[0, 0, 0, 0, 0]} />} />
      </section>

      <LiveFeed />
      <DORA />
      <AIInsights />
    </div>
  );
}
