import {
  EventRow,
  FilterBar,
  Panel,
  Pill,
  Sparkline,
  StackFrame,
  Tile,
  Timestamp,
} from './shared/ui';
import styles from './App.module.css';

const NOW = Date.now();

export function App() {
  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <div className={styles.brand}>
          <span className={styles.brandMark}>●</span>
          <span className={styles.brandName}>@erne/monitor</span>
          <span className={styles.brandVersion}>v0.1.0</span>
        </div>
        <p className={styles.subtitle}>
          Runtime intelligence dashboard — UI kit preview (Tasks 92–93)
        </p>
      </header>

      <main className={styles.main}>
        <section className={styles.tiles}>
          <Tile
            label="Crashes / 24h"
            value="12"
            delta="+3"
            deltaDirection="up"
            deltaSeverity="critical"
            trend={<Sparkline data={[2, 4, 3, 6, 5, 7, 12]} color="#ff5a5f" />}
          />
          <Tile
            label="ANRs / 24h"
            value="3"
            delta="−1"
            deltaDirection="down"
            deltaSeverity="success"
            trend={<Sparkline data={[4, 5, 4, 3, 3, 4, 3]} color="#fbbf24" />}
          />
          <Tile
            label="P95 TTI"
            value="2.14s"
            delta="−120ms"
            deltaDirection="down"
            deltaSeverity="success"
            trend={<Sparkline data={[2300, 2260, 2210, 2190, 2170, 2150, 2140]} color="#60a5fa" />}
          />
          <Tile
            label="Events / min"
            value="84"
            delta="±0"
            deltaDirection="flat"
            deltaSeverity="muted"
            trend={<Sparkline data={[80, 82, 84, 84, 86, 84, 84]} />}
          />
        </section>

        <Panel
          title="Live feed"
          description="Most recent monitor events, top of the stream."
          action={
            <FilterBar ariaLabel="Live feed filters">
              <Pill severity="critical" size="sm" interactive>
                crash
              </Pill>
              <Pill severity="warning" size="sm" interactive>
                anr
              </Pill>
              <Pill severity="info" size="sm" interactive>
                network
              </Pill>
              <Pill severity="muted" size="sm" interactive>
                custom
              </Pill>
            </FilterBar>
          }
          bleed
        >
          <div className={styles.feed}>
            <EventRow
              timestamp={NOW - 4_000}
              type="crash"
              severity="critical"
              message="TypeError: cannot read property 'id' of undefined"
              summary="fp: 76hp6x"
              now={NOW}
            />
            <EventRow
              timestamp={NOW - 62_000}
              type="anr"
              severity="warning"
              message="Main thread blocked for 5.2s"
              summary="screen: Settings"
              now={NOW}
            />
            <EventRow
              timestamp={NOW - 5 * 60_000}
              type="network"
              severity="info"
              message="GET /api/users 500"
              summary="742ms"
              now={NOW}
            />
            <EventRow
              timestamp={NOW - 12 * 60_000}
              type="custom"
              severity="muted"
              message="user.logged_in"
              summary="session: 42"
              now={NOW}
              selected
            />
          </div>
        </Panel>

        <Panel title="Sample stack trace" density="compact">
          <div className={styles.stack}>
            <StackFrame
              symbol="UserList.render"
              location="src/screens/UserList.tsx:128:12"
              resolved
            />
            <StackFrame
              symbol="FlatList.renderItem"
              location="node_modules/react-native/Libraries/Lists/FlatList.js:512:8"
            />
            <StackFrame symbol="<anonymous>" />
          </div>
        </Panel>

        <footer className={styles.footer}>
          <Timestamp ts={NOW - 3_600_000} format="both" now={NOW} />
        </footer>
      </main>
    </div>
  );
}
