import type { MonitorEvent } from '../../types';

/**
 * Maps crash and error events to OTel log records.
 */

export interface OTelLogRecord {
  timeUnixNano: string;
  severityNumber: number; // SEVERITY_ERROR = 17, SEVERITY_FATAL = 21
  severityText: string;
  body: { stringValue: string };
  attributes: Array<{ key: string; value: { stringValue?: string; intValue?: string } }>;
  traceId?: string;
  spanId?: string;
}

export function mapEventToLogRecord(
  event: MonitorEvent,
  appId: string,
): OTelLogRecord | null {
  const data = event.data as Record<string, unknown> | undefined;
  if (!data) return null;

  const timeNano = (BigInt(event.timestamp) * BigInt(1_000_000)).toString();
  const baseAttrs: OTelLogRecord['attributes'] = [
    { key: 'app.id', value: { stringValue: appId } },
    { key: 'session.id', value: { stringValue: event.sessionId } },
  ];

  if (event.type === 'crash') {
    const crash = data as {
      message?: string;
      stack?: string;
      fingerprint?: string;
      signal?: string;
    };
    const isFatal = !!crash.signal; // native crash = fatal
    return {
      timeUnixNano: timeNano,
      severityNumber: isFatal ? 21 : 17, // FATAL vs ERROR
      severityText: isFatal ? 'FATAL' : 'ERROR',
      body: { stringValue: crash.message ?? crash.signal ?? 'crash' },
      attributes: [
        ...baseAttrs,
        ...(crash.fingerprint
          ? [{ key: 'crash.fingerprint', value: { stringValue: crash.fingerprint } }]
          : []),
        ...(crash.stack
          ? [{ key: 'exception.stacktrace', value: { stringValue: crash.stack } }]
          : []),
      ],
    };
  }

  if (event.type === 'network') {
    const net = data as {
      url?: string;
      status?: number;
      method?: string;
      error?: string;
    };
    if (net.error || (typeof net.status === 'number' && net.status >= 500)) {
      return {
        timeUnixNano: timeNano,
        severityNumber: 17, // ERROR
        severityText: 'ERROR',
        body: {
          stringValue: net.error ?? `HTTP ${net.status} ${net.method ?? 'GET'} ${net.url ?? ''}`,
        },
        attributes: [
          ...baseAttrs,
          ...(net.url ? [{ key: 'http.url', value: { stringValue: net.url } }] : []),
          ...(net.method ? [{ key: 'http.method', value: { stringValue: net.method } }] : []),
          ...(typeof net.status === 'number'
            ? [{ key: 'http.status_code', value: { intValue: String(net.status) } }]
            : []),
        ],
      };
    }
  }

  return null;
}
