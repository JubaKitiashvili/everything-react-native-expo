/**
 * `@erne/monitor/replay` — session replay and visual repro. Includes
 * the PII mask processor, replay capture collector, layout snapshot,
 * and navigation-triggered screenshot ring buffer.
 *
 * Pulls the native bridge for screenshot capture and layout snapshot —
 * keep this subpath opt-in for consumers who enabled the replay
 * collector in their config.
 */

export { ReplayMasker } from '../processors/ReplayMasker';
export type {
  ReplayMaskRegion,
  ReplayMaskerOptions,
} from '../processors/ReplayMasker';

export { ReplayCollector } from '../collectors/native/ReplayCollector';
export type { ReplayCollectorDeps } from '../collectors/native/ReplayCollector';

export { LayoutSnapshotCollector } from '../collectors/native/LayoutSnapshotCollector';
export type { LayoutSnapshotCollectorDeps } from '../collectors/native/LayoutSnapshotCollector';

export { VisualReproCollector } from '../collectors/native/VisualReproCollector';
export type { VisualReproCollectorDeps } from '../collectors/native/VisualReproCollector';
