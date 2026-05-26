import { Performance } from './components/Performance';
import { NetworkWaterfall } from './components/NetworkWaterfall';
import { Flamegraph } from './components/Flamegraph';
import { TraceWaterfall } from './components/TraceWaterfall';
import { RscBoundaries } from './components/RscBoundaries';
import styles from './PerformancePage.module.css';

/**
 * Performance page. Serves `/performance` — runtime performance vitals
 * (FPS, CPU, memory, Fabric commits, startup waterfall), the per-session
 * network request timeline, a Hermes CPU flamegraph, a distributed trace
 * waterfall, and React Server Component boundaries. No detail route.
 */
export function PerformancePage() {
  return (
    <div className={styles.page}>
      <Performance />
      <NetworkWaterfall />
      <Flamegraph />
      <TraceWaterfall />
      <RscBoundaries />
    </div>
  );
}
