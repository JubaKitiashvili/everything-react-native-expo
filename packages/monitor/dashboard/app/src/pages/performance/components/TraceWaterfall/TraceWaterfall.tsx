import { useMemo, useState } from 'react';
import { Panel } from '@/shared/ui/Panel/Panel';
import { useEvents } from '@/shared/hooks/useEvents';
import type { EventRecord } from '@/shared/api/types';
import { buildLatestTraceTree, formatDurationMs, type SpanNode } from './buildSpanTree';
import { SpanRow } from './SpanRow';
import { SpanDetail } from './SpanDetail';
import styles from './TraceWaterfall.module.css';

export interface TraceWaterfallProps {
  /** Test/storybook escape hatch — bypass the live query when provided. */
  events?: EventRecord[];
}

export function TraceWaterfall({ events }: TraceWaterfallProps = {}) {
  if (events !== undefined) {
    return <TraceWaterfallView events={events} />;
  }
  return <TraceWaterfallContainer />;
}

function TraceWaterfallContainer() {
  const query = useEvents({ filter: { type: 'trace', limit: 1 } });

  if (query.isPending) {
    return (
      <Panel title="Trace Waterfall" description="Span tree for the latest captured trace.">
        <div className={styles.placeholder}>Loading trace…</div>
      </Panel>
    );
  }
  if (query.isError) {
    return (
      <Panel title="Trace Waterfall" description="Span tree for the latest captured trace.">
        <div className={styles.error}>
          Couldn&apos;t load trace events: {String((query.error as Error)?.message ?? '')}
        </div>
      </Panel>
    );
  }
  return <TraceWaterfallView events={query.data ?? []} />;
}

function TraceWaterfallView({ events }: { events: EventRecord[] }) {
  const tree = useMemo(() => buildLatestTraceTree(events), [events]);
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set());
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const selected = useMemo(() => findSpan(tree.roots, selectedId), [tree.roots, selectedId]);

  const toggleCollapse = (id: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectSpan = (id: string) => {
    setSelectedId((prev) => (prev === id ? null : id));
  };

  return (
    <Panel
      title="Trace Waterfall"
      description="Span tree for the latest captured trace."
      bleed
      action={
        tree.spanCount > 0 ? (
          <span className={styles.meta}>
            {tree.spanCount} span{tree.spanCount === 1 ? '' : 's'} ·{' '}
            {formatDurationMs(tree.durationMs)}
          </span>
        ) : undefined
      }
    >
      <div className={styles.body}>
        {tree.spanCount === 0 ? (
          <div className={styles.empty}>No trace captured yet.</div>
        ) : (
          <>
            <div className={styles.tree} role="tree" aria-label="Trace spans">
              {tree.roots.map((root) => (
                <SpanBranch
                  key={root.id}
                  span={root}
                  collapsed={collapsed}
                  selectedId={selectedId}
                  onToggleCollapse={toggleCollapse}
                  onSelect={selectSpan}
                />
              ))}
            </div>
            {selected ? (
              <div className={styles.detailWrap}>
                <SpanDetail span={selected} traceStart={tree.traceStart} />
              </div>
            ) : null}
          </>
        )}
      </div>
    </Panel>
  );
}

function SpanBranch({
  span,
  collapsed,
  selectedId,
  onToggleCollapse,
  onSelect,
}: {
  span: SpanNode;
  collapsed: ReadonlySet<string>;
  selectedId: string | null;
  onToggleCollapse: (id: string) => void;
  onSelect: (id: string) => void;
}) {
  const hasChildren = span.children.length > 0;
  const isCollapsed = collapsed.has(span.id);
  return (
    <div
      className={styles.branch}
      role="treeitem"
      aria-expanded={hasChildren ? !isCollapsed : undefined}
    >
      <SpanRow
        span={span}
        selected={selectedId === span.id}
        hasChildren={hasChildren}
        collapsed={isCollapsed}
        onSelect={() => onSelect(span.id)}
        onToggleCollapse={() => onToggleCollapse(span.id)}
      />
      {hasChildren && !isCollapsed ? (
        <div className={styles.children} role="group">
          {span.children.map((child) => (
            <SpanBranch
              key={child.id}
              span={child}
              collapsed={collapsed}
              selectedId={selectedId}
              onToggleCollapse={onToggleCollapse}
              onSelect={onSelect}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function findSpan(roots: SpanNode[], id: string | null): SpanNode | null {
  if (id === null) return null;
  const stack = [...roots];
  while (stack.length > 0) {
    const node = stack.pop()!;
    if (node.id === id) return node;
    for (const child of node.children) stack.push(child);
  }
  return null;
}
