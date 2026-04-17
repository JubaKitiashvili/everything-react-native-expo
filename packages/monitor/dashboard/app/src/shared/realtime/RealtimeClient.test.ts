import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { RealtimeClient, type RealtimeFrame } from './RealtimeClient';

/**
 * Minimal stand-in for the browser WebSocket. Lets us drive open/message/
 * close events from the test body with no timing surprises.
 */
class MockWebSocket {
  static instances: MockWebSocket[] = [];
  static OPEN = 1;
  static CLOSED = 3;

  readyState = 0;
  url: string;
  private listeners: Record<string, Array<(ev: unknown) => void>> = {};

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
  }

  addEventListener(type: string, fn: (ev: unknown) => void): void {
    (this.listeners[type] ??= []).push(fn);
  }

  close(): void {
    this.readyState = MockWebSocket.CLOSED;
    this.fire('close', {});
  }

  send(): void {
    /* tests never exercise client-side send */
  }

  openFromServer(): void {
    this.readyState = MockWebSocket.OPEN;
    this.fire('open', {});
  }

  messageFromServer(data: unknown): void {
    this.fire('message', { data: typeof data === 'string' ? data : JSON.stringify(data) });
  }

  errorFromServer(): void {
    this.fire('error', {});
  }

  private fire(event: string, payload: unknown): void {
    for (const listener of this.listeners[event] ?? []) listener(payload);
  }
}

function makeSchedule(): {
  schedule: (fn: () => void, delay: number) => number;
  clear: (handle: number) => void;
  pending: Array<{ fn: () => void; delay: number }>;
  runNext: () => void;
} {
  const pending: Array<{ fn: () => void; delay: number }> = [];
  let id = 0;
  return {
    pending,
    schedule: (fn, delay) => {
      id += 1;
      pending.push({ fn, delay });
      return id;
    },
    clear: () => {
      pending.length = 0;
    },
    runNext: () => {
      const entry = pending.shift();
      if (!entry) throw new Error('no scheduled reconnect');
      entry.fn();
    },
  };
}

describe('RealtimeClient', () => {
  beforeEach(() => {
    MockWebSocket.instances = [];
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('connects, transitions through connecting → open, and delivers frames', () => {
    const frames: RealtimeFrame[] = [];
    const statuses: string[] = [];
    const client = new RealtimeClient({
      url: 'ws://test/ws/subscribe',
      onFrame: (f) => frames.push(f),
      onStatus: (s) => statuses.push(s),
      webSocketImpl: MockWebSocket as unknown as typeof WebSocket,
    });
    client.start();
    const ws = MockWebSocket.instances[0]!;

    expect(statuses).toEqual(['connecting']);
    ws.openFromServer();
    expect(statuses).toEqual(['connecting', 'open']);

    ws.messageFromServer({ kind: 'hello', serverTime: 1 });
    ws.messageFromServer({
      kind: 'event',
      event: {
        id: 'e1',
        type: 'custom',
        severity: 'info',
        sessionId: 's1',
        timestamp: 1,
        receivedAt: 2,
        payload: {},
      },
    });
    ws.messageFromServer('not-json');
    ws.messageFromServer(null);

    expect(frames.map((f) => f.kind)).toEqual(['hello', 'event']);
  });

  test('reconnects with exponential backoff after an unexpected close', () => {
    const sched = makeSchedule();
    const statuses: string[] = [];
    const client = new RealtimeClient({
      url: 'ws://test/ws/subscribe',
      onFrame: () => {},
      onStatus: (s) => statuses.push(s),
      webSocketImpl: MockWebSocket as unknown as typeof WebSocket,
      scheduleReconnect: sched.schedule,
      clearScheduled: sched.clear,
      initialBackoffMs: 100,
    });
    client.start();
    const first = MockWebSocket.instances[0]!;
    first.openFromServer();
    first.close();

    // One reconnect scheduled
    expect(sched.pending).toHaveLength(1);
    expect(sched.pending[0]?.delay).toBeGreaterThanOrEqual(100);
    expect(client.attempts).toBe(1);

    sched.runNext();
    expect(MockWebSocket.instances).toHaveLength(2);

    // Second failure doubles the backoff
    MockWebSocket.instances[1]!.close();
    expect(sched.pending[0]?.delay).toBeGreaterThanOrEqual(200);
    expect(statuses).toContain('connecting');
    expect(statuses).toContain('closed');
  });

  test('stop() cancels pending reconnects and prevents further connects', () => {
    const sched = makeSchedule();
    const client = new RealtimeClient({
      url: 'ws://test/ws/subscribe',
      onFrame: () => {},
      webSocketImpl: MockWebSocket as unknown as typeof WebSocket,
      scheduleReconnect: sched.schedule,
      clearScheduled: sched.clear,
    });
    client.start();
    MockWebSocket.instances[0]!.close();
    expect(sched.pending).toHaveLength(1);

    client.stop();
    expect(sched.pending).toHaveLength(0);
  });
});
