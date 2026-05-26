// Task 117.68 — PrometheusRegistry unit tests.

import { describe, expect, test } from 'vitest';
import { PrometheusRegistry, PROMETHEUS_CONTENT_TYPE } from './prometheus.js';

describe('PrometheusRegistry', () => {
  test('renders a counter in text-exposition format with HELP + TYPE', () => {
    const reg = new PrometheusRegistry();
    reg.observeCounter('erne_events_total', 'Total events ingested and stored.', 1234);
    const out = reg.render();
    expect(out).toContain('# HELP erne_events_total Total events ingested and stored.');
    expect(out).toContain('# TYPE erne_events_total counter');
    expect(out).toContain('erne_events_total 1234');
    expect(out.endsWith('\n')).toBe(true);
  });

  test('renders a gauge', () => {
    const reg = new PrometheusRegistry();
    reg.observeGauge('erne_uptime_seconds', 'Process uptime in seconds.', 42);
    const out = reg.render();
    expect(out).toContain('# TYPE erne_uptime_seconds gauge');
    expect(out).toContain('erne_uptime_seconds 42');
  });

  test('renders multiple metrics in registration order', () => {
    const reg = new PrometheusRegistry();
    reg.observeCounter('a_total', 'A', 1);
    reg.observeGauge('b_gauge', 'B', 2);
    const out = reg.render();
    expect(out.indexOf('a_total')).toBeLessThan(out.indexOf('b_gauge'));
  });

  test('set() upserts the single label-less sample', () => {
    const reg = new PrometheusRegistry();
    reg.counter('c_total', 'C').set('c_total', 5).set('c_total', 9);
    const out = reg.render();
    expect(out).toContain('c_total 9');
    expect(out).not.toContain('c_total 5');
  });

  test('renders labels with escaping and upserts per label set', () => {
    const reg = new PrometheusRegistry();
    reg.counter('http_requests_total', 'HTTP requests');
    reg.set('http_requests_total', 1, { method: 'get' });
    reg.set('http_requests_total', 2, { method: 'post' });
    reg.set('http_requests_total', 3, { method: 'get' }); // upsert get → 3
    const out = reg.render();
    expect(out).toContain('http_requests_total{method="get"} 3');
    expect(out).toContain('http_requests_total{method="post"} 2');
    expect(out).not.toContain('http_requests_total{method="get"} 1');
  });

  test('escapes special characters in label values', () => {
    const reg = new PrometheusRegistry();
    reg.counter('m_total', 'M');
    reg.set('m_total', 1, { path: 'a"b\\c' });
    const out = reg.render();
    expect(out).toContain('m_total{path="a\\"b\\\\c"} 1');
  });

  test('a defined-but-unsampled metric renders as 0', () => {
    const reg = new PrometheusRegistry();
    reg.gauge('g_idle', 'Idle gauge');
    expect(reg.render()).toContain('g_idle 0');
  });

  test('renders non-finite values as the Prometheus tokens', () => {
    const reg = new PrometheusRegistry();
    reg.observeGauge('inf_gauge', 'inf', Infinity);
    reg.observeGauge('nan_gauge', 'nan', NaN);
    const out = reg.render();
    expect(out).toContain('inf_gauge +Inf');
    expect(out).toContain('nan_gauge NaN');
  });

  test('rejects an invalid metric name', () => {
    const reg = new PrometheusRegistry();
    expect(() => reg.counter('1bad-name', 'x')).toThrow(/invalid metric name/);
  });

  test('rejects an invalid label name on render', () => {
    const reg = new PrometheusRegistry();
    reg.counter('ok_total', 'ok');
    reg.set('ok_total', 1, { 'bad-label': 'v' });
    expect(() => reg.render()).toThrow(/invalid label name/);
  });

  test('rejects re-registering a name with a different type', () => {
    const reg = new PrometheusRegistry();
    reg.counter('dup', 'first');
    expect(() => reg.gauge('dup', 'second')).toThrow(/already registered as counter/);
  });

  test('set() on an unknown metric throws', () => {
    const reg = new PrometheusRegistry();
    expect(() => reg.set('nope', 1)).toThrow(/unknown metric/);
  });

  test('exposes the Prometheus content type', () => {
    expect(PROMETHEUS_CONTENT_TYPE).toBe('text/plain; version=0.0.4; charset=utf-8');
  });
});
