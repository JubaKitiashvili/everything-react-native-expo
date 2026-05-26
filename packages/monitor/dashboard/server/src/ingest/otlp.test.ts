import { describe, expect, test } from 'vitest';
import {
  anyValueToJs,
  attributesToObject,
  mapLogs,
  mapMetrics,
  mapTraces,
  severityFromNumber,
  unixNanoToMs,
} from './otlp.js';

const FIXED_NOW = 1_700_000_000_000;
const ctx = { now: () => FIXED_NOW };

describe('unixNanoToMs', () => {
  test('converts a numeric nanosecond value to integer ms', () => {
    expect(unixNanoToMs(1_700_000_000_000_000_000)).toBe(1_700_000_000_000);
  });

  test('converts a string nanosecond value with exact ms precision', () => {
    // 64-bit nanos overflow 2^53 — BigInt path must stay exact.
    expect(unixNanoToMs('1700000000123000000')).toBe(1_700_000_000_123);
  });

  test('returns null for missing / non-numeric / negative input', () => {
    expect(unixNanoToMs(undefined)).toBeNull();
    expect(unixNanoToMs(null)).toBeNull();
    expect(unixNanoToMs('not-a-number')).toBeNull();
    expect(unixNanoToMs('')).toBeNull();
    expect(unixNanoToMs(-5)).toBeNull();
  });
});

describe('anyValueToJs / attributesToObject', () => {
  test('flattens each AnyValue variant', () => {
    expect(anyValueToJs({ stringValue: 'hi' })).toBe('hi');
    expect(anyValueToJs({ boolValue: true })).toBe(true);
    expect(anyValueToJs({ doubleValue: 1.5 })).toBe(1.5);
    expect(anyValueToJs({ intValue: '42' })).toBe(42);
    expect(anyValueToJs({ arrayValue: { values: [{ stringValue: 'a' }] } })).toEqual(['a']);
    expect(
      anyValueToJs({ kvlistValue: { values: [{ key: 'k', value: { stringValue: 'v' } }] } }),
    ).toEqual({ k: 'v' });
    expect(anyValueToJs(undefined)).toBeUndefined();
  });

  test('flattens a KeyValue[] into a plain object and skips empty keys', () => {
    expect(
      attributesToObject([
        { key: 'http.method', value: { stringValue: 'GET' } },
        { key: 'http.status', value: { intValue: 200 } },
        { key: '', value: { stringValue: 'ignored' } },
        { value: { stringValue: 'no-key' } },
      ]),
    ).toEqual({ 'http.method': 'GET', 'http.status': 200 });
  });

  test('tolerates undefined attributes', () => {
    expect(attributesToObject(undefined)).toEqual({});
  });
});

describe('severityFromNumber', () => {
  test('maps the OTel severity ladder onto our Severity buckets', () => {
    expect(severityFromNumber(1)).toBe('muted'); // TRACE
    expect(severityFromNumber(9)).toBe('info'); // INFO
    expect(severityFromNumber(13)).toBe('warning'); // WARN
    expect(severityFromNumber(17)).toBe('critical'); // ERROR
    expect(severityFromNumber(21)).toBe('critical'); // FATAL
  });

  test('falls back to severityText then info', () => {
    expect(severityFromNumber(undefined, 'ERROR')).toBe('critical');
    expect(severityFromNumber(undefined, 'warn')).toBe('warning');
    expect(severityFromNumber(undefined, 'DEBUG')).toBe('muted');
    expect(severityFromNumber(undefined)).toBe('info');
  });
});

describe('mapTraces', () => {
  test('maps a span with nanosecond timestamps + status + attributes', () => {
    const records = mapTraces(
      {
        resourceSpans: [
          {
            resource: {
              attributes: [
                { key: 'service.name', value: { stringValue: 'checkout' } },
                { key: 'os.type', value: { stringValue: 'ios' } },
              ],
            },
            scopeSpans: [
              {
                scope: { name: 'tracer-a' },
                spans: [
                  {
                    traceId: 'abc',
                    spanId: 'def',
                    parentSpanId: 'par',
                    name: 'GET /cart',
                    kind: 2,
                    startTimeUnixNano: '1700000000000000000',
                    endTimeUnixNano: '1700000000500000000',
                    attributes: [{ key: 'http.method', value: { stringValue: 'GET' } }],
                    status: { code: 2, message: 'boom' },
                  },
                ],
              },
            ],
          },
        ],
      },
      ctx,
    );

    expect(records).toHaveLength(1);
    const r = records[0]!;
    expect(r.type).toBe('span');
    expect(r.severity).toBe('warning'); // status code 2 = ERROR
    expect(r.sessionId).toBe('otel:checkout');
    expect(r.platform).toBe('ios');
    expect(r.timestamp).toBe(1_700_000_000_000);
    expect(r.receivedAt).toBe(FIXED_NOW);
    expect(r.payload).toMatchObject({
      name: 'GET /cart',
      scope: 'tracer-a',
      traceId: 'abc',
      spanId: 'def',
      parentSpanId: 'par',
      kind: 2,
      startTimeMs: 1_700_000_000_000,
      endTimeMs: 1_700_000_000_500,
      durationMs: 500,
      statusCode: 2,
      statusMessage: 'boom',
      attributes: { 'http.method': 'GET' },
    });
  });

  test('OK / unset status stays info; falls back to now when start missing', () => {
    const records = mapTraces(
      {
        resourceSpans: [
          { scopeSpans: [{ spans: [{ name: 'noop', status: { code: 1 } }] }] },
        ],
      },
      ctx,
    );
    expect(records[0]!.severity).toBe('info');
    expect(records[0]!.timestamp).toBe(FIXED_NOW);
    expect(records[0]!.sessionId).toBe('otel:unknown');
  });

  test('tolerates empty / partial / non-object payloads', () => {
    expect(mapTraces({}, ctx)).toEqual([]);
    expect(mapTraces({ resourceSpans: [] }, ctx)).toEqual([]);
    expect(mapTraces({ resourceSpans: [{}] }, ctx)).toEqual([]);
    expect(mapTraces({ resourceSpans: [{ scopeSpans: [{}] }] }, ctx)).toEqual([]);
    expect(mapTraces(null, ctx)).toEqual([]);
    expect(mapTraces('garbage', ctx)).toEqual([]);
  });
});

describe('mapLogs', () => {
  test('maps a logRecord: body → message, severityNumber → severity', () => {
    const records = mapLogs(
      {
        resourceLogs: [
          {
            resource: { attributes: [{ key: 'service.name', value: { stringValue: 'api' } }] },
            scopeLogs: [
              {
                scope: { name: 'logger-x' },
                logRecords: [
                  {
                    timeUnixNano: 1_700_000_000_000_000_000,
                    severityNumber: 17,
                    severityText: 'ERROR',
                    body: { stringValue: 'disk full' },
                    traceId: 't1',
                    spanId: 's1',
                    attributes: [{ key: 'code', value: { intValue: 500 } }],
                  },
                ],
              },
            ],
          },
        ],
      },
      ctx,
    );

    expect(records).toHaveLength(1);
    const r = records[0]!;
    expect(r.type).toBe('log');
    expect(r.severity).toBe('critical');
    expect(r.sessionId).toBe('otel:api');
    expect(r.timestamp).toBe(1_700_000_000_000);
    expect(r.payload).toMatchObject({
      message: 'disk full',
      scope: 'logger-x',
      severityText: 'ERROR',
      severityNumber: 17,
      traceId: 't1',
      spanId: 's1',
      attributes: { code: 500 },
    });
  });

  test('serialises a non-string body and falls back to observedTime', () => {
    const records = mapLogs(
      {
        resourceLogs: [
          {
            scopeLogs: [
              {
                logRecords: [
                  {
                    observedTimeUnixNano: '1700000000000000000',
                    body: { kvlistValue: { values: [{ key: 'a', value: { intValue: 1 } }] } },
                  },
                ],
              },
            ],
          },
        ],
      },
      ctx,
    );
    expect(records[0]!.payload.message).toBe(JSON.stringify({ a: 1 }));
    expect(records[0]!.timestamp).toBe(1_700_000_000_000);
    expect(records[0]!.severity).toBe('info');
  });

  test('tolerates empty / partial payloads', () => {
    expect(mapLogs({}, ctx)).toEqual([]);
    expect(mapLogs({ resourceLogs: [{}] }, ctx)).toEqual([]);
    expect(mapLogs({ resourceLogs: [{ scopeLogs: [{ logRecords: [] }] }] }, ctx)).toEqual([]);
  });
});

describe('mapMetrics', () => {
  test('maps gauge + sum number data points', () => {
    const records = mapMetrics(
      {
        resourceMetrics: [
          {
            resource: { attributes: [{ key: 'service.name', value: { stringValue: 'worker' } }] },
            scopeMetrics: [
              {
                scope: { name: 'meter-1' },
                metrics: [
                  {
                    name: 'cpu.usage',
                    unit: '%',
                    description: 'cpu',
                    gauge: {
                      dataPoints: [
                        {
                          timeUnixNano: 1_700_000_000_000_000_000,
                          asDouble: 0.42,
                          attributes: [{ key: 'core', value: { intValue: 0 } }],
                        },
                      ],
                    },
                  },
                  {
                    name: 'requests',
                    sum: { dataPoints: [{ asInt: '15' }] },
                  },
                ],
              },
            ],
          },
        ],
      },
      ctx,
    );

    expect(records).toHaveLength(2);
    const gauge = records.find((r) => r.payload.name === 'cpu.usage')!;
    expect(gauge.type).toBe('metric');
    expect(gauge.severity).toBe('info');
    expect(gauge.sessionId).toBe('otel:worker');
    expect(gauge.timestamp).toBe(1_700_000_000_000);
    expect(gauge.payload).toMatchObject({
      name: 'cpu.usage',
      value: 0.42,
      unit: '%',
      description: 'cpu',
      scope: 'meter-1',
      attributes: { core: 0 },
    });
    const sum = records.find((r) => r.payload.name === 'requests')!;
    expect(sum.payload.value).toBe(15);
    expect(sum.timestamp).toBe(FIXED_NOW); // no timestamp on the point
  });

  test('maps histogram / summary points using sum + count', () => {
    const records = mapMetrics(
      {
        resourceMetrics: [
          {
            scopeMetrics: [
              {
                metrics: [
                  {
                    name: 'latency',
                    histogram: { dataPoints: [{ sum: 12.5, count: '3' }] },
                  },
                ],
              },
            ],
          },
        ],
      },
      ctx,
    );
    expect(records).toHaveLength(1);
    expect(records[0]!.payload).toMatchObject({ name: 'latency', value: 12.5, count: 3 });
  });

  test('tolerates empty / partial payloads', () => {
    expect(mapMetrics({}, ctx)).toEqual([]);
    expect(mapMetrics({ resourceMetrics: [{}] }, ctx)).toEqual([]);
    expect(
      mapMetrics({ resourceMetrics: [{ scopeMetrics: [{ metrics: [{ name: 'x' }] }] }] }, ctx),
    ).toEqual([]); // a metric with no data points yields no records
  });

  test('deterministic ids collapse on replay', () => {
    const payload = {
      resourceMetrics: [
        {
          scopeMetrics: [{ metrics: [{ name: 'm', gauge: { dataPoints: [{ asDouble: 1 }] } }] }],
        },
      ],
    };
    const a = mapMetrics(payload, ctx);
    const b = mapMetrics(payload, ctx);
    expect(a[0]!.id).toBe(b[0]!.id);
  });
});
