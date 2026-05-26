import { Performance } from './components/Performance';
import { NetworkWaterfall } from './components/NetworkWaterfall';
import styles from './PerformancePage.module.css';

/**
 * Performance page. Serves `/performance` — runtime performance vitals
 * (FPS, CPU, memory, Fabric commits, startup waterfall) alongside the
 * per-session network request timeline. No detail route.
 */
export function PerformancePage() {
  return (
    <div className={styles.page}>
      <Performance />
      <NetworkWaterfall />
    </div>
  );
}
