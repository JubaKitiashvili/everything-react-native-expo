// Task 117.16 — Latency histogram + CDF chart.
//
// Inputs: a sample array (typically network or render durations in ms).
// Output: a stacked SVG with histogram bars + a CDF curve overlay +
// P50/P95/P99 ruled vertical lines + an unmissable "Bimodal" pill when
// the distribution clearly looks like two populations. Hover surfaces
// per-bucket count + range in a small tooltip.
//
// All maths happens in `computeHistogram.ts` + `detectBimodal.ts`.
// This file is purely presentational so react-refresh can hot-reload
// it without bailing.

import { useMemo, useState, type ReactElement } from 'react';
import styles from './HistogramCDF.module.css';
import {
  computeCdf,
  computeHistogram,
  percentile,
  type ComputeHistogramOptions,
  type HistogramBucket,
} from './computeHistogram';
import { detectBimodal, type DetectBimodalResult } from './detectBimodal';

export interface HistogramCDFProps {
  /** Latency samples in whatever unit the caller chooses (default render assumes ms). */
  samples: readonly number[];
  /** Caller-friendly title rendered top-left. */
  title?: string;
  /** Width of the chart area in CSS pixels. */
  width?: number;
  /** Height of the chart area in CSS pixels. */
  height?: number;
  /** Bucket count for the histogram (default 24). */
  bucketCount?: number;
  /** Override the X-axis domain — useful for keeping the axis stable across rerenders. */
  domain?: { min: number; max: number };
  /** Unit suffix appended to the tooltip's range numbers. Default `ms`. */
  unit?: string;
  /** Bimodal-detection knobs forwarded to `detectBimodal`. */
  bimodal?: { minSeparationBuckets?: number; troughRatio?: number; minTotalCount?: number };
  /** ARIA label override. Default communicates "Latency histogram + CDF". */
  ariaLabel?: string;
}

const DEFAULT_WIDTH = 360;
const DEFAULT_HEIGHT = 160;
const PADDING = { top: 8, right: 12, bottom: 22, left: 32 };
/**
 * Pixel buffer between the visual right edge and the highest P-line so
 * the dashed rule + label aren't clipped when P99 falls right on the
 * histogram's max value.
 */
const RIGHT_EDGE_PAD = 4;

export function HistogramCDF({
  samples,
  title,
  width = DEFAULT_WIDTH,
  height = DEFAULT_HEIGHT,
  bucketCount = 24,
  domain,
  unit = 'ms',
  bimodal,
  ariaLabel,
}: HistogramCDFProps) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  // Stable primitive deps so a fresh object identity in the parent
  // doesn't force a re-bin / re-detect on every render.
  const domainMin = domain?.min;
  const domainMax = domain?.max;
  const histogram = useMemo(() => {
    const opts: ComputeHistogramOptions = { bucketCount };
    if (domainMin !== undefined && domainMax !== undefined) {
      opts.domain = { min: domainMin, max: domainMax };
    }
    return computeHistogram(samples, opts);
  }, [samples, bucketCount, domainMin, domainMax]);
  const cdf = useMemo(
    () => computeCdf(histogram.buckets, histogram.totalCount),
    [histogram.buckets, histogram.totalCount],
  );
  const minSep = bimodal?.minSeparationBuckets;
  const troughRatio = bimodal?.troughRatio;
  const minTotal = bimodal?.minTotalCount;
  const bimodalResult = useMemo<DetectBimodalResult>(() => {
    const opts: NonNullable<HistogramCDFProps['bimodal']> = {};
    if (minSep !== undefined) opts.minSeparationBuckets = minSep;
    if (troughRatio !== undefined) opts.troughRatio = troughRatio;
    if (minTotal !== undefined) opts.minTotalCount = minTotal;
    return detectBimodal(histogram.buckets, opts);
  }, [histogram.buckets, minSep, troughRatio, minTotal]);

  const p50 = useMemo(() => percentile(samples, 0.5), [samples]);
  const p95 = useMemo(() => percentile(samples, 0.95), [samples]);
  const p99 = useMemo(() => percentile(samples, 0.99), [samples]);

  if (histogram.buckets.length === 0 || histogram.totalCount === 0) {
    return (
      <div className={styles.root}>
        {title ? (
          <div className={styles.header}>
            <span className={styles.title}>{title}</span>
          </div>
        ) : null}
        <div className={styles.empty} role="img" aria-label={ariaLabel ?? 'No latency samples'}>
          No samples
        </div>
      </div>
    );
  }

  const innerWidth = Math.max(0, width - PADDING.left - PADDING.right - RIGHT_EDGE_PAD);
  const innerHeight = Math.max(0, height - PADDING.top - PADDING.bottom);
  const maxCount = histogram.buckets.reduce((m, b) => Math.max(m, b.count), 0) || 1;
  const xStep = innerWidth / histogram.buckets.length;

  const valueToX = (v: number): number => {
    const span = histogram.max - histogram.min;
    if (span <= 0) return PADDING.left + innerWidth / 2;
    const ratio = (v - histogram.min) / span;
    return PADDING.left + Math.max(0, Math.min(1, ratio)) * innerWidth;
  };

  const cdfPath = buildCdfPath(histogram.buckets, cdf, PADDING, innerWidth, innerHeight);
  const ariaLabelEffective =
    ariaLabel ??
    `Latency histogram with CDF, ${histogram.totalCount} samples, P50 ${p50.toFixed(1)} ${unit}, P95 ${p95.toFixed(1)} ${unit}, P99 ${p99.toFixed(1)} ${unit}${bimodalResult.isBimodal ? ', bimodal' : ''}`;

  const tooltip = hoverIndex !== null ? renderTooltip(histogram.buckets[hoverIndex]!, unit) : null;

  return (
    <div className={styles.root}>
      <div className={styles.header}>
        <span className={styles.title}>{title}</span>
        {bimodalResult.isBimodal ? (
          <span className={styles.bimodalPill} title="Two clear modes detected — drill in.">
            Bimodal
          </span>
        ) : null}
      </div>

      <div className={styles.chartWrapper}>
        <svg
          className={styles.chart}
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={ariaLabelEffective}
        >
          {/* Bars */}
          {histogram.buckets.map((b, i) => {
            const barHeight = (b.count / maxCount) * innerHeight;
            const x = PADDING.left + i * xStep;
            const y = PADDING.top + (innerHeight - barHeight);
            return (
              <rect
                key={i}
                className={`${styles.bar}${i === hoverIndex ? ` ${styles.barActive}` : ''}`}
                x={x}
                y={y}
                width={Math.max(1, xStep - 1)}
                height={barHeight}
                onMouseEnter={() => setHoverIndex(i)}
                onMouseLeave={() => setHoverIndex(null)}
                onFocus={() => setHoverIndex(i)}
                onBlur={() => setHoverIndex(null)}
                tabIndex={0}
                aria-label={`${b.count} samples in ${b.start.toFixed(1)} to ${b.end.toFixed(1)} ${unit}`}
              />
            );
          })}

          {/* CDF curve */}
          {cdfPath ? <path className={styles.cdfStroke} d={cdfPath} /> : null}

          {/* P-line rules */}
          {renderRule(p50, valueToX, height, PADDING, 'P50', styles.ruleP50 ?? '', unit)}
          {renderRule(p95, valueToX, height, PADDING, 'P95', styles.ruleP95 ?? '', unit)}
          {renderRule(p99, valueToX, height, PADDING, 'P99', styles.ruleP99 ?? '', unit)}
        </svg>

        {tooltip ? (
          <div
            className={styles.tooltip}
            style={{
              left: PADDING.left + (hoverIndex! + 0.5) * xStep,
              top: PADDING.top,
            }}
          >
            {tooltip}
          </div>
        ) : null}
      </div>

      <div className={styles.legend} aria-hidden>
        <span>
          <span className={styles.legendDot} style={{ background: 'var(--color-brand-mint)' }} />
          Histogram
        </span>
        <span>
          <span className={styles.legendDot} style={{ background: 'var(--color-severity-info)' }} />
          CDF
        </span>
        <span>
          <span className={styles.legendDot} style={{ background: 'var(--color-severity-warning)' }} />
          P95
        </span>
        <span>
          <span className={styles.legendDot} style={{ background: 'var(--color-severity-critical)' }} />
          P99
        </span>
      </div>
    </div>
  );
}

function buildCdfPath(
  buckets: readonly HistogramBucket[],
  cdf: readonly number[],
  padding: { top: number; right: number; bottom: number; left: number },
  innerWidth: number,
  innerHeight: number,
): string {
  if (buckets.length === 0 || cdf.length !== buckets.length) return '';
  const xStep = innerWidth / buckets.length;
  // Anchor the curve at (left edge, baseline) so the eye sees it climb from 0 → 1.
  const points: Array<{ x: number; y: number }> = [
    { x: padding.left, y: padding.top + innerHeight },
  ];
  for (let i = 0; i < buckets.length; i++) {
    const x = padding.left + (i + 1) * xStep;
    const y = padding.top + innerHeight - (cdf[i] ?? 0) * innerHeight;
    points.push({ x, y });
  }
  return points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`)
    .join(' ');
}

function renderRule(
  value: number,
  valueToX: (v: number) => number,
  height: number,
  padding: { top: number; right: number; bottom: number; left: number },
  label: string,
  className: string,
  unit: string,
): ReactElement | null {
  if (!Number.isFinite(value)) return null;
  const x = valueToX(value);
  return (
    <g>
      <line
        className={`${styles.ruleLine} ${className}`}
        x1={x}
        x2={x}
        y1={padding.top}
        y2={height - padding.bottom + 2}
      />
      <text
        className={styles.ruleLabel}
        x={x + 3}
        y={padding.top + 10}
        aria-hidden
      >
        {label}: {value.toFixed(1)} {unit}
      </text>
    </g>
  );
}

function renderTooltip(bucket: HistogramBucket, unit: string): ReactElement {
  return (
    <span>
      <strong>{bucket.count}</strong>{' '}
      <span className={styles.tooltipMuted}>
        in [{bucket.start.toFixed(1)}, {bucket.end.toFixed(1)}) {unit}
      </span>
    </span>
  );
}
