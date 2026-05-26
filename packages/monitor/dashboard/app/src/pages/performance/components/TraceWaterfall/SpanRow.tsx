import { formatDurationMs, type SpanNode } from './buildSpanTree';
import styles from './SpanRow.module.css';

export interface SpanRowProps {
  span: SpanNode;
  /** Whether this span is currently selected (its detail is shown). */
  selected: boolean;
  /** Whether this span has children that can be collapsed. */
  hasChildren: boolean;
  /** Whether this span's children are currently collapsed. */
  collapsed: boolean;
  /** Select / deselect the span (shows its detail). */
  onSelect: () => void;
  /** Toggle the collapsed state of this span's children. */
  onToggleCollapse: () => void;
}

/** Cap depth used for the color band so very deep trees still cycle nicely. */
const DEPTH_COLORS = 6;

export function SpanRow({
  span,
  selected,
  hasChildren,
  collapsed,
  onSelect,
  onToggleCollapse,
}: SpanRowProps) {
  const depthClass = `depth${span.depth % DEPTH_COLORS}`;
  // Guarantee a sub-pixel-safe minimum so even zero-width spans stay visible.
  const widthPct = Math.max(1.5, span.width * 100);
  const leftPct = Math.min(98.5, span.offset * 100);

  return (
    <div
      className={[styles.row, selected ? styles.selected : null].filter(Boolean).join(' ')}
      data-depth={span.depth}
    >
      <div className={styles.label} style={{ paddingLeft: `${span.depth * 16}px` }}>
        {hasChildren ? (
          <button
            type="button"
            className={styles.toggle}
            aria-label={collapsed ? `Expand ${span.name}` : `Collapse ${span.name}`}
            aria-expanded={!collapsed}
            onClick={onToggleCollapse}
          >
            <span className={styles.caret} data-collapsed={collapsed} aria-hidden="true">
              ▸
            </span>
          </button>
        ) : (
          <span className={styles.toggleSpacer} aria-hidden="true" />
        )}
        <button
          type="button"
          className={styles.name}
          aria-pressed={selected}
          onClick={onSelect}
          title={span.name}
        >
          {span.name}
        </button>
      </div>

      <div className={styles.trackWrap} aria-hidden="true">
        <div className={styles.track}>
          <div
            className={[styles.bar, styles[depthClass]].filter(Boolean).join(' ')}
            style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
          />
          {span.checkpointOffsets.map((cp, index) => (
            <span
              key={`${cp.label}-${index}`}
              className={styles.checkpoint}
              style={{ left: `${cp.offset * 100}%` }}
              title={cp.label}
            />
          ))}
        </div>
      </div>

      <span className={styles.duration}>{formatDurationMs(span.durationMs)}</span>
    </div>
  );
}
