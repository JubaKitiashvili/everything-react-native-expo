import { useEffect, useMemo, useRef, useState } from 'react';
import type { EventRecord, Severity } from '../../shared/api/types';
import { Pill } from '../../shared/ui/Pill/Pill';
import { Timestamp } from '../../shared/ui/Timestamp/Timestamp';
import {
  PLAYBACK_RATES,
  advanceScrubber,
  selectFrame,
  type ReplayFrame,
  type ReplayMask,
} from './playback';
import styles from './ReplayViewer.module.css';

export interface ReplayViewerProps {
  frames: ReplayFrame[];
  events: EventRecord[];
  now?: number;
  /** Test hook: inject a fake requestAnimationFrame / Date.now pair. */
  clock?: ReplayClock;
}

export interface ReplayClock {
  now: () => number;
  schedule: (fn: () => void) => () => void;
}

const SEVERITY_ORDER: Record<Severity, number> = {
  critical: 0,
  warning: 1,
  info: 2,
  success: 3,
  muted: 4,
};

const DEFAULT_CLOCK: ReplayClock = {
  now: () => (typeof performance !== 'undefined' ? performance.now() : Date.now()),
  schedule: (fn) => {
    const handle = requestAnimationFrame(fn);
    return () => cancelAnimationFrame(handle);
  },
};

export function ReplayViewer({ frames, events, now, clock = DEFAULT_CLOCK }: ReplayViewerProps) {
  const minTs = frames[0]?.timestamp ?? 0;
  const maxTs = frames[frames.length - 1]?.timestamp ?? 0;
  const span = Math.max(1, maxTs - minTs);

  const [scrubberTs, setScrubberTs] = useState<number>(minTs);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [playbackRate, setPlaybackRate] = useState<number>(1);
  const [masksVisible, setMasksVisible] = useState<boolean>(true);
  const lastTickRef = useRef<number>(0);

  useEffect(() => {
    setScrubberTs(minTs);
    setIsPlaying(false);
  }, [minTs, maxTs]);

  useEffect(() => {
    if (!isPlaying || frames.length < 2) return;
    let cancelled = false;
    lastTickRef.current = clock.now();

    const tick = () => {
      if (cancelled) return;
      const t = clock.now();
      const elapsed = t - lastTickRef.current;
      lastTickRef.current = t;
      setScrubberTs((prev) => {
        const { ts, done } = advanceScrubber(prev, elapsed, playbackRate, minTs, maxTs);
        if (done) setIsPlaying(false);
        return ts;
      });
      if (!cancelled) cancel = clock.schedule(tick);
    };

    let cancel = clock.schedule(tick);
    return () => {
      cancelled = true;
      cancel();
    };
  }, [isPlaying, playbackRate, minTs, maxTs, frames.length, clock]);

  const activeFrame = useMemo(() => selectFrame(frames, scrubberTs), [frames, scrubberTs]);
  const activeEvents = useMemo(
    () => pickActiveEvents(events, scrubberTs, 500),
    [events, scrubberTs],
  );

  if (frames.length === 0) {
    return <p className={styles.empty}>No replay frames captured for this session.</p>;
  }

  const progressPercent = ((scrubberTs - minTs) / span) * 100;

  return (
    <div className={styles.viewer}>
      <div className={styles.stage} aria-label="Replay frame">
        {activeFrame?.image ? (
          <img src={activeFrame.image} alt="Session replay frame" className={styles.frameImage} />
        ) : (
          <div className={styles.frameFallback}>Frame {activeFrame?.id ?? '—'}</div>
        )}
        {masksVisible && activeFrame?.masks
          ? activeFrame.masks.map((mask, i) => <Mask key={i} mask={mask} />)
          : null}
        {activeEvents.length > 0 ? (
          <div className={styles.overlay} aria-label="Events at this frame">
            {activeEvents.slice(0, 3).map((event) => (
              <div key={event.id} className={styles.eventChip}>
                <Pill severity={event.severity} size="sm">
                  {event.type}
                </Pill>
                <span className={styles.eventMessage}>{messageOf(event)}</span>
              </div>
            ))}
          </div>
        ) : null}
      </div>

      <div className={styles.timeline}>
        <div className={styles.markers} aria-hidden="true">
          {events.map((event) => {
            const left = clampPercent(((event.timestamp - minTs) / span) * 100);
            if (left < 0 || left > 100) return null;
            return (
              <span
                key={event.id}
                className={styles.marker}
                data-severity={event.severity}
                style={{ left: `${left}%` }}
                title={`${event.type} · ${messageOf(event)}`}
              />
            );
          })}
          <span
            className={styles.progressFill}
            style={{ width: `${clampPercent(progressPercent)}%` }}
          />
        </div>
        <input
          className={styles.scrubber}
          type="range"
          min={minTs}
          max={maxTs}
          step={Math.max(1, Math.floor(span / 1000))}
          value={scrubberTs}
          onChange={(e) => {
            setIsPlaying(false);
            setScrubberTs(Number(e.target.value));
          }}
          aria-label="Scrub through replay timeline"
        />
        <div className={styles.timelineLabels}>
          <Timestamp ts={minTs} {...(now !== undefined ? { now } : {})} />
          <span className={styles.currentTime}>
            {formatDuration(scrubberTs - minTs)} / {formatDuration(span)}
          </span>
          <Timestamp ts={maxTs} {...(now !== undefined ? { now } : {})} />
        </div>
      </div>

      <div className={styles.controls}>
        <button
          type="button"
          className={styles.playButton}
          onClick={() => {
            if (scrubberTs >= maxTs) setScrubberTs(minTs);
            setIsPlaying((prev) => !prev);
          }}
          aria-label={isPlaying ? 'Pause playback' : 'Play replay'}
        >
          {isPlaying ? 'Pause' : 'Play'}
        </button>
        <div className={styles.speedGroup} role="group" aria-label="Playback speed">
          {PLAYBACK_RATES.map((rate) => (
            <button
              key={rate}
              type="button"
              className={[styles.speedButton, rate === playbackRate ? styles.speedActive : null]
                .filter(Boolean)
                .join(' ')}
              onClick={() => setPlaybackRate(rate)}
              aria-pressed={rate === playbackRate}
            >
              {rate}×
            </button>
          ))}
        </div>
        <label className={styles.toggleLabel}>
          <input
            type="checkbox"
            checked={masksVisible}
            onChange={(e) => setMasksVisible(e.target.checked)}
          />
          PII masks
        </label>
      </div>
    </div>
  );
}

function Mask({ mask }: { mask: ReplayMask }) {
  return (
    <div
      className={styles.mask}
      style={{ left: mask.x, top: mask.y, width: mask.width, height: mask.height }}
      title={mask.reason ?? 'PII mask'}
    />
  );
}

function clampPercent(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.min(Math.max(value, 0), 100);
}

function pickActiveEvents(events: EventRecord[], ts: number, windowMs: number): EventRecord[] {
  return events
    .filter((e) => e.type !== 'replay_frame' && Math.abs(e.timestamp - ts) <= windowMs)
    .sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
}

function messageOf(event: EventRecord): string {
  const payload = event.payload as { message?: unknown };
  const raw = typeof payload.message === 'string' ? payload.message : '';
  return raw.length > 0 ? raw : event.type;
}

function formatDuration(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const mins = Math.floor(s / 60);
  const secs = s % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}
