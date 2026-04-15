import type { MonitorEvent } from '../../types';

/**
 * Maps navigation events to OTel span format.
 * Each screen-to-screen transition becomes a trace span.
 */

export interface OTelSpan {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  name: string;
  kind: number; // SPAN_KIND_INTERNAL = 1
  startTimeUnixNano: string;
  endTimeUnixNano: string;
  attributes: OTelAttribute[];
  status: { code: number };
}

export interface OTelAttribute {
  key: string;
  value: { stringValue?: string; intValue?: string; boolValue?: boolean };
}

export function mapNavigationToSpan(event: MonitorEvent): OTelSpan | null {
  const data = event.data as Record<string, unknown> | undefined;
  if (!data) return null;

  const navData = data as {
    from?: string;
    to?: string;
    durationMs?: number;
    params?: Record<string, unknown>;
  };

  const traceId = padHex(event.sessionId, 32);
  const spanId = padHex(String(event.timestamp), 16);
  const startNano = BigInt(event.timestamp) * BigInt(1_000_000);
  const durationMs = typeof navData.durationMs === 'number' ? navData.durationMs : 0;
  const endNano = startNano + BigInt(durationMs) * BigInt(1_000_000);

  const attributes: OTelAttribute[] = [
    { key: 'screen.from', value: { stringValue: String(navData.from ?? '') } },
    { key: 'screen.to', value: { stringValue: String(navData.to ?? '') } },
    { key: 'session.id', value: { stringValue: event.sessionId } },
  ];

  return {
    traceId,
    spanId,
    name: `navigate: ${navData.from ?? '?'} → ${navData.to ?? '?'}`,
    kind: 1, // INTERNAL
    startTimeUnixNano: startNano.toString(),
    endTimeUnixNano: endNano.toString(),
    attributes,
    status: { code: 1 }, // OK
  };
}

function padHex(input: string, length: number): string {
  let hex = '';
  for (let i = 0; i < input.length; i++) {
    hex += input.charCodeAt(i).toString(16);
  }
  return hex.padStart(length, '0').slice(0, length);
}
