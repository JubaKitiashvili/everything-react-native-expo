// @erne/monitor canonical event type surface.
//
// This file is the single source of truth consumed by the schema codegen
// (scripts/codegen/schema-codegen.ts). Every interface exported here is
// read by ts-morph and translated to matching Swift structs and Kotlin
// data classes that the Phase 2 native module can import.
//
// RULES for interfaces in this file:
//   - Only primitives (string, number, boolean), arrays, optionals, and
//     nested interfaces. No function signatures, no generics, no unions
//     of non-literal types.
//   - Every field must have an explicit type — ts-morph's inference is
//     not good enough for cross-language translation.
//   - Names ending in "EventData" are auto-discovered; others must be
//     annotated with `@codegen-include` in a JSDoc comment.

/** Discriminated union of all monitor event types. */
export type MonitorEventKind =
  | 'crash'
  | 'network'
  | 'navigation'
  | 'render'
  | 'custom';

/** Envelope that wraps every emitted event. */
export interface MonitorEventEnvelope {
  type: MonitorEventKind;
  timestamp: number;
  wallTime: number;
  sessionId: string;
}

/** Crash event payload produced by CrashCollector. */
export interface CrashEventPayload {
  kind: 'exception' | 'unhandled-rejection';
  message: string;
  stack: string | null;
  componentStack: string | null;
  isFatal: boolean;
  fingerprint?: string;
  rejectionId?: number;
}

/** Network event payload produced by NetworkCollector. */
export interface NetworkEventPayload {
  url: string;
  method: string;
  statusCode: number | null;
  durationMs: number;
  requestSize: number | null;
  responseSize: number | null;
  transport: 'fetch' | 'xhr';
  errorMessage?: string;
}

/** Navigation event payload produced by NavigationCollector. */
export interface NavigationEventPayload {
  screen: string;
  previousScreen: string | null;
  source: 'expo-router' | 'react-navigation' | 'manual';
  durationMs: number;
}

/** Custom event payload produced by CustomEventCollector. */
export interface CustomEventPayload {
  name: string;
  attributes: Record<string, string | number | boolean>;
}

/** Render event payload produced by RenderCollector. */
export interface RenderEventPayload {
  componentName: string;
  renderCount: number;
  totalDurationMs: number;
  maxDurationMs: number;
  isUnnecessary: boolean;
  windowMs: number;
}

/** Frame drop payload nested inside render events from FrameDropCollector. */
export interface FrameDropEventPayload {
  droppedFrames: number;
  expectedFrames: number;
  durationMs: number;
  averageFps: number;
  minFps: number;
}

/** Context envelope produced by Enricher. */
export interface EventContext {
  device: EventDevice;
  app: EventApp;
  session: EventSession;
  connectionType: 'wifi' | 'cellular' | 'offline' | 'unknown';
  memory: EventMemory | null;
}

export interface EventDevice {
  platform: 'ios' | 'android' | 'web' | 'unknown';
  osVersion: string;
  model: string;
  isEmulator: boolean;
  screenWidth: number;
  screenHeight: number;
  locale: string;
}

export interface EventApp {
  version: string;
  buildNumber: string;
  bundleId: string;
}

export interface EventSession {
  id: string;
  durationMs: number;
}

export interface EventMemory {
  usedBytes: number;
  totalBytes: number;
}
