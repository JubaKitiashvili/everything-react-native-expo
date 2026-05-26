// Task 117.68 — Prometheus text-exposition formatter.
//
// A dependency-free registry that renders counters and gauges in the
// Prometheus text exposition format (version 0.0.4). We deliberately do
// NOT pull in `prom-client`: the dashboard exposes a handful of scalar
// metrics, the format is trivial, and avoiding the dep keeps the server's
// install footprint tiny.
//
// Format reference (one metric):
//
//   # HELP erne_events_total Total events ingested and stored.
//   # TYPE erne_events_total counter
//   erne_events_total 1234
//
// Labels are supported (`name{key="value"} 1`) with proper escaping of
// `\`, `"`, and newlines per the spec. Metric/label names are validated
// against the Prometheus identifier grammar; an invalid name throws at
// registration time (a programming error, not a runtime input).

export type MetricType = 'counter' | 'gauge';

export interface MetricSample {
  /** Optional label set. Values are escaped on render. */
  labels?: Record<string, string>;
  value: number;
}

interface MetricDef {
  name: string;
  help: string;
  type: MetricType;
  samples: MetricSample[];
}

const METRIC_NAME_RE = /^[a-zA-Z_:][a-zA-Z0-9_:]*$/;
const LABEL_NAME_RE = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

function assertMetricName(name: string): void {
  if (!METRIC_NAME_RE.test(name)) {
    throw new Error(`PrometheusRegistry: invalid metric name "${name}"`);
  }
}

function assertLabelName(name: string): void {
  if (!LABEL_NAME_RE.test(name)) {
    throw new Error(`PrometheusRegistry: invalid label name "${name}"`);
  }
}

/** Escape a HELP line per the exposition format (\\, \n). */
function escapeHelp(help: string): string {
  return help.replace(/\\/g, '\\\\').replace(/\n/g, '\\n');
}

/** Escape a label value per the exposition format (\\, \", \n). */
function escapeLabelValue(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
}

/**
 * Render a numeric value the way Prometheus expects: integers as-is,
 * non-finite values as the spec's special tokens.
 */
function renderValue(value: number): string {
  if (Number.isNaN(value)) return 'NaN';
  if (value === Infinity) return '+Inf';
  if (value === -Infinity) return '-Inf';
  return String(value);
}

function renderLabels(labels: Record<string, string> | undefined): string {
  if (!labels) return '';
  const pairs = Object.entries(labels);
  if (pairs.length === 0) return '';
  const rendered = pairs
    .map(([k, v]) => {
      assertLabelName(k);
      return `${k}="${escapeLabelValue(v)}"`;
    })
    .join(',');
  return `{${rendered}}`;
}

/**
 * Minimal in-memory metrics registry. Define metrics with
 * `counter()` / `gauge()`, push samples, then `render()` for the
 * text exposition body.
 */
export class PrometheusRegistry {
  private readonly metrics = new Map<string, MetricDef>();

  /** Register (or fetch) a counter. Help text is set on first registration. */
  counter(name: string, help: string): this {
    return this.define(name, help, 'counter');
  }

  /** Register (or fetch) a gauge. */
  gauge(name: string, help: string): this {
    return this.define(name, help, 'gauge');
  }

  private define(name: string, help: string, type: MetricType): this {
    assertMetricName(name);
    const existing = this.metrics.get(name);
    if (existing) {
      if (existing.type !== type) {
        throw new Error(
          `PrometheusRegistry: metric "${name}" already registered as ${existing.type}`,
        );
      }
      return this;
    }
    this.metrics.set(name, { name, help, type, samples: [] });
    return this;
  }

  /**
   * Set a metric's value. For a label-less metric this replaces the
   * single sample; with labels it upserts the sample for that label set.
   * The metric must already be defined (via `counter`/`gauge`).
   */
  set(name: string, value: number, labels?: Record<string, string>): this {
    const def = this.metrics.get(name);
    if (!def) {
      throw new Error(`PrometheusRegistry: set() on unknown metric "${name}"`);
    }
    const key = labels ? JSON.stringify(sortLabels(labels)) : '';
    const idx = def.samples.findIndex(
      (s) => (s.labels ? JSON.stringify(sortLabels(s.labels)) : '') === key,
    );
    const sample: MetricSample = labels ? { labels, value } : { value };
    if (idx >= 0) def.samples[idx] = sample;
    else def.samples.push(sample);
    return this;
  }

  /** Convenience: define a counter and set its value in one call. */
  observeCounter(name: string, help: string, value: number): this {
    return this.counter(name, help).set(name, value);
  }

  /** Convenience: define a gauge and set its value in one call. */
  observeGauge(name: string, help: string, value: number): this {
    return this.gauge(name, help).set(name, value);
  }

  /** Render the full registry as a Prometheus text-exposition body. */
  render(): string {
    const lines: string[] = [];
    for (const def of this.metrics.values()) {
      lines.push(`# HELP ${def.name} ${escapeHelp(def.help)}`);
      lines.push(`# TYPE ${def.name} ${def.type}`);
      if (def.samples.length === 0) {
        // A defined-but-unsampled metric renders as 0 so scrape targets
        // always see a value rather than a gap.
        lines.push(`${def.name} 0`);
        continue;
      }
      for (const sample of def.samples) {
        lines.push(`${def.name}${renderLabels(sample.labels)} ${renderValue(sample.value)}`);
      }
    }
    // Exposition bodies end with a trailing newline.
    return `${lines.join('\n')}\n`;
  }
}

/** The content type Prometheus scrapers expect. */
export const PROMETHEUS_CONTENT_TYPE = 'text/plain; version=0.0.4; charset=utf-8';

function sortLabels(labels: Record<string, string>): Array<[string, string]> {
  return Object.entries(labels).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
}
