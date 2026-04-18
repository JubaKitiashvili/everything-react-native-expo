import type { SessionRecord } from '../../shared/api/types';

export interface Device {
  /** Stable id — hashed from platform + model + osVersion + appVersion. */
  fingerprint: string;
  platform: string;
  model: string;
  osVersion: string;
  appVersion: string;
  runtimeVersion: string | null;
  channel: string;
  sessions: SessionRecord[];
  sessionCount: number;
  eventCount: number;
  crashCount: number;
  firstSeen: number;
  lastSeen: number;
}

/**
 * Group sessions into distinct devices. "Device" here is a fingerprint
 * over the stable SDK-captured fields; two sessions from the same app
 * + platform + model + OS version + app version collapse into one card.
 *
 * The resulting list is sorted by lastSeen descending so the freshest
 * device sits at the top of the picker.
 */
export function extractDevices(sessions: SessionRecord[]): Device[] {
  const byFingerprint = new Map<string, Device>();
  for (const session of sessions) {
    const { fingerprint, platform, model, osVersion, appVersion, runtimeVersion, channel } =
      readDeviceFields(session);
    const existing = byFingerprint.get(fingerprint);
    if (existing) {
      existing.sessions.push(session);
      existing.sessionCount += 1;
      existing.eventCount += session.eventCount;
      existing.crashCount += session.crashCount;
      if (session.startedAt < existing.firstSeen) existing.firstSeen = session.startedAt;
      const latest = Math.max(session.endedAt ?? session.startedAt, session.startedAt);
      if (latest > existing.lastSeen) existing.lastSeen = latest;
    } else {
      const latest = Math.max(session.endedAt ?? session.startedAt, session.startedAt);
      byFingerprint.set(fingerprint, {
        fingerprint,
        platform,
        model,
        osVersion,
        appVersion,
        runtimeVersion,
        channel,
        sessions: [session],
        sessionCount: 1,
        eventCount: session.eventCount,
        crashCount: session.crashCount,
        firstSeen: session.startedAt,
        lastSeen: latest,
      });
    }
  }
  return [...byFingerprint.values()].sort((a, b) => b.lastSeen - a.lastSeen);
}

/**
 * Reduce a session to the device signature we key by. Unknown fields
 * collapse into `unknown` so sessions without rich device info still
 * get grouped instead of each forming its own "unknown" card.
 */
export function readDeviceFields(session: SessionRecord): {
  fingerprint: string;
  platform: string;
  model: string;
  osVersion: string;
  appVersion: string;
  runtimeVersion: string | null;
  channel: string;
} {
  const device = (session.device ?? {}) as Record<string, unknown>;
  const platform =
    normaliseString(session.platform) ?? normaliseString(device.platform) ?? 'unknown';
  const model = normaliseString(device.model) ?? normaliseString(device.name) ?? 'unknown';
  const osVersion =
    normaliseString(device.osVersion) ??
    normaliseString(device.systemVersion) ??
    normaliseString(device.os) ??
    'unknown';
  const appVersion = normaliseString(session.appVersion) ?? 'unknown';
  const runtimeVersion = normaliseString(session.runtimeVersion);
  const channel = normaliseString(session.channel) ?? 'default';
  return {
    fingerprint: [platform, model, osVersion, appVersion].join('|').toLowerCase(),
    platform,
    model,
    osVersion,
    appVersion,
    runtimeVersion,
    channel,
  };
}

function normaliseString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}
