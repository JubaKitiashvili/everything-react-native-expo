import { Sparkline, Tile } from './shared/ui';
import { LiveFeed } from './panels/LiveFeed';
import { CrashExplorer } from './panels/CrashExplorer';
import { SessionReplay } from './panels/SessionReplay';
import { Performance } from './panels/Performance';
import { ANRInspector } from './panels/ANRInspector';
import { NetworkWaterfall } from './panels/NetworkWaterfall';
import { BreadcrumbTimeline } from './panels/BreadcrumbTimeline';
import { AIInsights } from './panels/AIInsights';
import { AlertsConsole } from './panels/AlertsConsole';
import { DORA } from './panels/DORA';
import { BugReportsInbox } from './panels/BugReportsInbox';
import { PatternLibrary } from './panels/PatternLibrary';
import { DeviceSwitcher } from './panels/DeviceSwitcher';
import { Symbolication } from './panels/Symbolication';
import { ReplayMasker } from './panels/ReplayMasker';
import { ConsentPrivacy } from './panels/ConsentPrivacy';
import styles from './App.module.css';

export function App() {
  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <div className={styles.brand}>
          <span className={styles.brandMark}>●</span>
          <span className={styles.brandName}>@erne/monitor</span>
          <span className={styles.brandVersion}>v0.1.0</span>
        </div>
        <p className={styles.subtitle}>Runtime intelligence dashboard</p>
      </header>

      <main className={styles.main}>
        <section className={styles.tiles}>
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
        <DeviceSwitcher />
        <DORA />
        <Performance />
        <AIInsights />
        <PatternLibrary />
        <ANRInspector />
        <NetworkWaterfall />
        <CrashExplorer />
        <Symbolication />
        <BreadcrumbTimeline />
        <AlertsConsole />
        <BugReportsInbox />
        <SessionReplay />
        <ReplayMasker />
        <ConsentPrivacy />
      </main>
    </div>
  );
}
