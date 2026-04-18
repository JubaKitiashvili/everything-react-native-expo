import { Pill } from '../../shared/ui/Pill/Pill';
import { Timestamp } from '../../shared/ui/Timestamp/Timestamp';
import type { Device } from './aggregate';
import styles from './DeviceCard.module.css';

export interface DeviceCardProps {
  device: Device;
  selected: boolean;
  activeSessionId: string | null;
  onSelectDevice: (fingerprint: string) => void;
  onSelectSession: (sessionId: string) => void;
  now?: number;
}

const PLATFORM_GLYPH: Record<string, string> = {
  ios: '',
  android: '🤖',
  web: '🌐',
};

export function DeviceCard({
  device,
  selected,
  activeSessionId,
  onSelectDevice,
  onSelectSession,
  now,
}: DeviceCardProps) {
  const glyph = PLATFORM_GLYPH[device.platform] ?? '📱';
  const freshSessions = [...device.sessions].sort((a, b) => b.startedAt - a.startedAt).slice(0, 5);

  return (
    <article
      className={[styles.card, selected ? styles.selected : null].filter(Boolean).join(' ')}
      aria-label={`Device ${device.model} card`}
    >
      <button
        type="button"
        className={styles.head}
        onClick={() => onSelectDevice(device.fingerprint)}
        aria-pressed={selected}
      >
        <span className={styles.glyph} aria-hidden="true">
          {glyph}
        </span>
        <div className={styles.headText}>
          <span className={styles.model}>{device.model}</span>
          <span className={styles.platform}>
            {device.platform.toUpperCase()} · {device.osVersion} · app {device.appVersion}
          </span>
        </div>
        <div className={styles.headPills}>
          {device.channel !== 'default' ? (
            <Pill size="sm" severity="info">
              {device.channel}
            </Pill>
          ) : null}
          {device.crashCount > 0 ? (
            <Pill size="sm" severity="critical">
              ×{device.crashCount} crash{device.crashCount === 1 ? '' : 'es'}
            </Pill>
          ) : null}
        </div>
      </button>

      <dl className={styles.meta}>
        <div>
          <dt>Sessions</dt>
          <dd>{device.sessionCount}</dd>
        </div>
        <div>
          <dt>Events</dt>
          <dd>{device.eventCount}</dd>
        </div>
        <div>
          <dt>Last seen</dt>
          <dd>
            <Timestamp ts={device.lastSeen} {...(now !== undefined ? { now } : {})} />
          </dd>
        </div>
        {device.runtimeVersion ? (
          <div>
            <dt>Runtime</dt>
            <dd className={styles.mono}>{device.runtimeVersion}</dd>
          </div>
        ) : null}
        <div>
          <dt>Fingerprint</dt>
          <dd className={styles.mono}>{device.fingerprint}</dd>
        </div>
      </dl>

      <ul className={styles.sessions} aria-label={`Recent sessions on ${device.model}`}>
        {freshSessions.map((session) => {
          const isActive = activeSessionId === session.id;
          return (
            <li key={session.id}>
              <button
                type="button"
                className={[styles.session, isActive ? styles.sessionActive : null]
                  .filter(Boolean)
                  .join(' ')}
                onClick={() => onSelectSession(session.id)}
                aria-pressed={isActive}
              >
                <code className={styles.sessionId}>{session.id}</code>
                <span className={styles.sessionMeta}>
                  {session.eventCount} events · {session.crashCount} crashes ·{' '}
                  <Timestamp ts={session.startedAt} {...(now !== undefined ? { now } : {})} />
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </article>
  );
}
