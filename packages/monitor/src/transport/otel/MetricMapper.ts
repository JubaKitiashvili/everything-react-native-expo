import type { MonitorEvent } from '../../types';

/**
 * Maps render/performance events to OTel metric data points.
 */

export interface OTelMetricDataPoint {
  attributes: Array<{ key: string; value: { stringValue?: string } }>;
  timeUnixNano: string;
  asDouble?: number;
  asInt?: string;
}

export interface OTelMetric {
  name: string;
  description: string;
  unit: string;
  gauge?: { dataPoints: OTelMetricDataPoint[] };
  histogram?: {
    dataPoints: Array<{
      attributes: Array<{ key: string; value: { stringValue?: string } }>;
      timeUnixNano: string;
      count: string;
      sum: number;
      min: number;
      max: number;
    }>;
  };
}

export function mapEventToMetrics(
  event: MonitorEvent,
  appId: string,
): OTelMetric[] {
  const data = event.data as Record<string, unknown> | undefined;
  if (!data) return [];
  const metrics: OTelMetric[] = [];
  const timeNano = (BigInt(event.timestamp) * BigInt(1_000_000)).toString();
  const baseAttrs = [{ key: 'app.id', value: { stringValue: appId } }];

  // DualThreadFPS
  const fps = data.dualThreadFPS as
    | { uiFPS: number; jsFPS: number }
    | undefined;
  if (fps) {
    metrics.push({
      name: 'erne.fps.ui',
      description: 'UI thread FPS',
      unit: 'fps',
      gauge: {
        dataPoints: [
          { attributes: baseAttrs, timeUnixNano: timeNano, asDouble: fps.uiFPS },
        ],
      },
    });
    metrics.push({
      name: 'erne.fps.js',
      description: 'JS thread FPS',
      unit: 'fps',
      gauge: {
        dataPoints: [
          { attributes: baseAttrs, timeUnixNano: timeNano, asDouble: fps.jsFPS },
        ],
      },
    });
  }

  // Native metrics
  const native = data as {
    cpuUsagePercent?: number;
    memoryUsedBytes?: number;
  };
  if (typeof native.cpuUsagePercent === 'number') {
    metrics.push({
      name: 'erne.cpu.usage',
      description: 'Process CPU usage percentage',
      unit: '%',
      gauge: {
        dataPoints: [
          {
            attributes: baseAttrs,
            timeUnixNano: timeNano,
            asDouble: native.cpuUsagePercent,
          },
        ],
      },
    });
  }
  if (typeof native.memoryUsedBytes === 'number') {
    metrics.push({
      name: 'erne.memory.used',
      description: 'Process memory usage',
      unit: 'By',
      gauge: {
        dataPoints: [
          {
            attributes: baseAttrs,
            timeUnixNano: timeNano,
            asInt: String(native.memoryUsedBytes),
          },
        ],
      },
    });
  }

  // Startup
  const startup = data as { startupKind?: string; durationMs?: number };
  if (startup.startupKind && typeof startup.durationMs === 'number') {
    metrics.push({
      name: 'erne.startup.duration',
      description: 'App startup duration',
      unit: 'ms',
      gauge: {
        dataPoints: [
          {
            attributes: [
              ...baseAttrs,
              { key: 'startup.kind', value: { stringValue: startup.startupKind } },
            ],
            timeUnixNano: timeNano,
            asDouble: startup.durationMs,
          },
        ],
      },
    });
  }

  return metrics;
}
