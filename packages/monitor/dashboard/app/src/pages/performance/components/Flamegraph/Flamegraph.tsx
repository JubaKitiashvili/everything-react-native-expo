import { useMemo } from 'react';
import { Panel } from '@/shared/ui/Panel/Panel';
import { useEvents } from '@/shared/hooks/useEvents';
import { colors } from '@/tokens';
import type { EventRecord } from '@/shared/api/types';
import { flattenFlame, foldSamples, type FlameNode, type ProfilePayload } from './foldSamples';
import styles from './Flamegraph.module.css';

const DESCRIPTION = 'Hermes CPU profile folded into a flame tree — width is total time, depth is call stack.';

const ROW_HEIGHT = 22;

/** Depth → fill colour. Cycles through the severity palette by depth. */
const DEPTH_PALETTE = [
  colors.brand.mint,
  colors.severity.info,
  colors.severity.warning,
  colors.severity.success,
  colors.severity.critical,
];

export interface FlamegraphProps {
  /** Pre-folded tree — purely for test/storybook injection. When present, the
   *  panel renders directly without any network fetch. */
  root?: FlameNode | null;
}

export function Flamegraph({ root }: FlamegraphProps = {}) {
  if (root !== undefined) {
    return <FlamegraphView root={root} />;
  }
  return <FlamegraphPanel />;
}

function FlamegraphPanel() {
  const query = useEvents({ filter: { type: 'profile', limit: 1 }, staleTime: 10_000 });
  if (query.isPending) {
    return (
      <Panel title="Flamegraph" description={DESCRIPTION}>
        <div className={styles.placeholder}>Loading profile…</div>
      </Panel>
    );
  }
  if (query.isError) {
    return (
      <Panel title="Flamegraph" description={DESCRIPTION}>
        <div className={styles.error}>
          Couldn&apos;t load the CPU profile: {String((query.error as Error)?.message ?? '')}
        </div>
      </Panel>
    );
  }
  const latest = pickLatestProfile(query.data ?? []);
  const root = latest ? foldSamples(latest.payload as unknown as ProfilePayload) : null;
  return <FlamegraphView root={root} />;
}

/** The newest `profile` event in the slice (events aren't guaranteed sorted). */
function pickLatestProfile(events: EventRecord[]): EventRecord | null {
  let latest: EventRecord | null = null;
  for (const event of events) {
    if (event.type !== 'profile') continue;
    if (!latest || event.timestamp > latest.timestamp) latest = event;
  }
  return latest;
}

interface ViewProps {
  root: FlameNode | null;
}

function FlamegraphView({ root }: ViewProps) {
  const nodes = useMemo(() => (root ? flattenFlame(root) : []), [root]);
  // Skip the synthetic root (depth 0) — it always spans the full width and
  // carries no useful label.
  const drawable = useMemo(() => nodes.filter((n) => n.depth > 0), [nodes]);
  const maxDepth = useMemo(() => drawable.reduce((m, n) => Math.max(m, n.depth), 0), [drawable]);
  const total = root?.value ?? 0;

  if (!root || drawable.length === 0) {
    return (
      <Panel title="Flamegraph" description={DESCRIPTION}>
        <div className={styles.empty}>No CPU profile captured yet.</div>
      </Panel>
    );
  }

  return (
    <Panel title="Flamegraph" description={DESCRIPTION}>
      <div className={styles.scroll}>
        <div
          className={styles.canvas}
          style={{ height: maxDepth * ROW_HEIGHT }}
          aria-label="Flamegraph frames"
          role="img"
        >
          {drawable.map((node) => {
            const widthPct = (node.x1 - node.x0) * 100;
            const pct = total > 0 ? (node.value / total) * 100 : 0;
            return (
              <div
                key={`${node.depth}:${node.name}:${node.x0}`}
                className={styles.frame}
                style={{
                  left: `${node.x0 * 100}%`,
                  width: `${widthPct}%`,
                  top: (node.depth - 1) * ROW_HEIGHT,
                  background: DEPTH_PALETTE[(node.depth - 1) % DEPTH_PALETTE.length],
                }}
                title={`${node.name} — ${node.value} (${pct.toFixed(1)}%)`}
              >
                <span className={styles.label}>{node.name}</span>
              </div>
            );
          })}
        </div>
      </div>
    </Panel>
  );
}
