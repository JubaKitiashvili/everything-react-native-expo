import type { MonitorEvent } from '../types';
import { mapNavigationToSpan, type OTelSpan } from './otel/TraceMapper';
import { mapEventToMetrics, type OTelMetric } from './otel/MetricMapper';
import { mapEventToLogRecord, type OTelLogRecord } from './otel/LogMapper';

/**
 * Task 55 — OTelExporter
 *
 * Exports monitor events as OpenTelemetry-compatible OTLP/HTTP payloads.
 * Can be used standalone (send to Grafana, Jaeger, Datadog) or with
 * the ERNE backend.
 */

export interface OTelResource {
  attributes: Array<{ key: string; value: { stringValue?: string } }>;
}

export interface OTelExporterDeps {
  /** OTLP endpoint base URL (e.g., 'https://otel.erne.dev'). */
  endpoint: string;
  /** App identifier for resource attributes. */
  appId: string;
  /** App version. */
  appVersion: string;
  /** Device/OS info. */
  osType?: string;
  deviceId?: string;
  /** Fetch implementation. */
  fetchImpl?: typeof fetch;
}

export class OTelExporter {
  private readonly deps: OTelExporterDeps;
  private readonly fetchImpl: typeof fetch;
  private readonly resource: OTelResource;

  constructor(deps: OTelExporterDeps) {
    this.deps = deps;
    this.fetchImpl = deps.fetchImpl ?? globalThis.fetch?.bind(globalThis);
    this.resource = {
      attributes: [
        { key: 'service.name', value: { stringValue: deps.appId } },
        { key: 'service.version', value: { stringValue: deps.appVersion } },
        ...(deps.osType
          ? [{ key: 'os.type', value: { stringValue: deps.osType } }]
          : []),
        ...(deps.deviceId
          ? [{ key: 'device.id', value: { stringValue: deps.deviceId } }]
          : []),
      ],
    };
  }

  /**
   * Export a batch of events as OTLP signals.
   * Maps each event to the appropriate signal type and sends to
   * the corresponding OTLP endpoint.
   */
  async exportBatch(events: readonly MonitorEvent[]): Promise<void> {
    const spans: OTelSpan[] = [];
    const metrics: OTelMetric[] = [];
    const logs: OTelLogRecord[] = [];

    for (const event of events) {
      // Navigation → traces
      if (event.type === 'navigation') {
        const span = mapNavigationToSpan(event);
        if (span) spans.push(span);
      }

      // Render/performance → metrics
      if (event.type === 'render' || event.type === 'custom') {
        const mapped = mapEventToMetrics(event, this.deps.appId);
        metrics.push(...mapped);
      }

      // Crash/network errors → logs
      const log = mapEventToLogRecord(event, this.deps.appId);
      if (log) logs.push(log);
    }

    const promises: Promise<void>[] = [];

    if (spans.length > 0) {
      promises.push(this.sendTraces(spans));
    }
    if (metrics.length > 0) {
      promises.push(this.sendMetrics(metrics));
    }
    if (logs.length > 0) {
      promises.push(this.sendLogs(logs));
    }

    await Promise.allSettled(promises);
  }

  /** Build OTLP traces payload. */
  buildTracesPayload(spans: readonly OTelSpan[]): Record<string, unknown> {
    return {
      resourceSpans: [
        {
          resource: this.resource,
          scopeSpans: [
            {
              scope: { name: '@erne/monitor', version: '1.0.0' },
              spans,
            },
          ],
        },
      ],
    };
  }

  /** Build OTLP metrics payload. */
  buildMetricsPayload(metrics: readonly OTelMetric[]): Record<string, unknown> {
    return {
      resourceMetrics: [
        {
          resource: this.resource,
          scopeMetrics: [
            {
              scope: { name: '@erne/monitor', version: '1.0.0' },
              metrics,
            },
          ],
        },
      ],
    };
  }

  /** Build OTLP logs payload. */
  buildLogsPayload(logs: readonly OTelLogRecord[]): Record<string, unknown> {
    return {
      resourceLogs: [
        {
          resource: this.resource,
          scopeLogs: [
            {
              scope: { name: '@erne/monitor', version: '1.0.0' },
              logRecords: logs,
            },
          ],
        },
      ],
    };
  }

  private async sendTraces(spans: OTelSpan[]): Promise<void> {
    await this.send('/v1/traces', this.buildTracesPayload(spans));
  }

  private async sendMetrics(metrics: OTelMetric[]): Promise<void> {
    await this.send('/v1/metrics', this.buildMetricsPayload(metrics));
  }

  private async sendLogs(logs: OTelLogRecord[]): Promise<void> {
    await this.send('/v1/logs', this.buildLogsPayload(logs));
  }

  private async send(path: string, payload: Record<string, unknown>): Promise<void> {
    try {
      await this.fetchImpl(`${this.deps.endpoint}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    } catch {
      // Swallow — OTLP export is best-effort
    }
  }
}
