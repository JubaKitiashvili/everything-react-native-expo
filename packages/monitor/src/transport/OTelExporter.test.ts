import { OTelExporter } from './OTelExporter';
import type { MonitorEvent } from '../types';

function makeEvent(overrides: Partial<MonitorEvent> = {}): MonitorEvent {
  return {
    type: 'custom',
    timestamp: 1700000000000,
    wallTime: 1700000000000,
    sessionId: 'sess-1',
    data: {},
    ...overrides,
  };
}

function makeExporter(fetchCalls?: Array<{ path: string; body: unknown }>) {
  const calls = fetchCalls ?? [];
  const fetchImpl = async (url: string, init: RequestInit) => {
    const path = new URL(url).pathname;
    calls.push({ path, body: JSON.parse(init.body as string) });
    return { ok: true, status: 200 } as Response;
  };
  const exporter = new OTelExporter({
    endpoint: 'https://otel.erne.dev',
    appId: 'com.test.app',
    appVersion: '1.0.0',
    osType: 'ios',
    deviceId: 'device-123',
    fetchImpl: fetchImpl as unknown as typeof fetch,
  });
  return { exporter, calls };
}

describe('OTelExporter', () => {
  test('maps navigation events to OTLP traces', async () => {
    const { exporter, calls } = makeExporter();
    await exporter.exportBatch([
      makeEvent({
        type: 'navigation',
        data: { from: 'Home', to: 'Profile', durationMs: 150 },
      }),
    ]);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.path).toBe('/v1/traces');
    const payload = calls[0]!.body as Record<string, unknown>;
    const spans = (payload.resourceSpans as unknown[])[0] as Record<string, unknown>;
    expect(spans.resource).toBeDefined();
  });

  test('maps crash events to OTLP logs with FATAL severity', async () => {
    const { exporter, calls } = makeExporter();
    await exporter.exportBatch([
      makeEvent({
        type: 'crash',
        data: { message: 'SIGSEGV', signal: 'SIGSEGV', fingerprint: 'abc' },
      }),
    ]);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.path).toBe('/v1/logs');
    const payload = calls[0]!.body as Record<string, unknown>;
    const logs = (payload.resourceLogs as unknown[])[0] as Record<string, unknown>;
    const scopeLogs = (logs.scopeLogs as unknown[])[0] as Record<string, unknown>;
    const records = scopeLogs.logRecords as Array<{ severityText: string }>;
    expect(records[0]!.severityText).toBe('FATAL');
  });

  test('maps render events with FPS data to OTLP metrics', async () => {
    const { exporter, calls } = makeExporter();
    await exporter.exportBatch([
      makeEvent({
        type: 'render',
        data: { dualThreadFPS: { uiFPS: 58, jsFPS: 45 } },
      }),
    ]);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.path).toBe('/v1/metrics');
  });

  test('maps network errors to OTLP logs', async () => {
    const { exporter, calls } = makeExporter();
    await exporter.exportBatch([
      makeEvent({
        type: 'network',
        data: { url: '/api/users', status: 500, method: 'GET' },
      }),
    ]);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.path).toBe('/v1/logs');
  });

  test('sends to multiple endpoints when batch has mixed event types', async () => {
    const { exporter, calls } = makeExporter();
    await exporter.exportBatch([
      makeEvent({ type: 'navigation', data: { from: 'A', to: 'B' } }),
      makeEvent({ type: 'crash', data: { message: 'error' } }),
      makeEvent({
        type: 'render',
        data: { dualThreadFPS: { uiFPS: 60, jsFPS: 60 } },
      }),
    ]);
    const paths = calls.map((c) => c.path).sort();
    expect(paths).toEqual(['/v1/logs', '/v1/metrics', '/v1/traces']);
  });

  test('includes resource attributes', () => {
    const { exporter } = makeExporter();
    const payload = exporter.buildTracesPayload([]);
    const resource = (
      (payload.resourceSpans as unknown[])[0] as Record<string, unknown>
    ).resource as Record<string, unknown>;
    const attrs = resource.attributes as Array<{
      key: string;
      value: { stringValue: string };
    }>;
    const keys = attrs.map((a) => a.key);
    expect(keys).toContain('service.name');
    expect(keys).toContain('service.version');
    expect(keys).toContain('os.type');
    expect(keys).toContain('device.id');
  });

  test('skips events with no data', async () => {
    const { exporter, calls } = makeExporter();
    await exporter.exportBatch([makeEvent({ type: 'custom', data: {} })]);
    // No meaningful data to map → no calls
    expect(calls).toHaveLength(0);
  });

  test('swallows fetch errors gracefully', async () => {
    const failFetch = async () => {
      throw new Error('Network error');
    };
    const exporter = new OTelExporter({
      endpoint: 'https://otel.erne.dev',
      appId: 'test',
      appVersion: '1.0',
      fetchImpl: failFetch as unknown as typeof fetch,
    });
    // Should not throw
    await exporter.exportBatch([
      makeEvent({ type: 'crash', data: { message: 'boom' } }),
    ]);
  });

  test('does not send when batch produces no signals', async () => {
    const { exporter, calls } = makeExporter();
    await exporter.exportBatch([
      makeEvent({ type: 'custom', data: { name: 'something' } }),
    ]);
    expect(calls).toHaveLength(0);
  });
});
