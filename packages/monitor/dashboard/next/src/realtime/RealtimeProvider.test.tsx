import { describe, it, expect, beforeEach } from 'vitest';
import { act, render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RealtimeProvider } from './RealtimeProvider';
import { useRealtimeContext, type RealtimeContextValue } from './RealtimeContext';
import { useRealtimeChannel } from './useRealtimeChannel';
import type { RealtimeFrame } from '@/shared/realtime';
import type { CrashGroupRecord, EventRecord } from '@/shared/api/types';
import { resetUiStore } from '@/shared/store/uiStore';

/** Minimal in-memory WebSocket double the RealtimeClient drives in tests. */
class MockWebSocket {
  static instances: MockWebSocket[] = [];
  url: string;
  readyState = 0;
  private listeners = new Map<string, Set<(ev: unknown) => void>>();

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
  }
  addEventListener(type: string, cb: (ev: unknown) => void) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type)!.add(cb);
  }
  removeEventListener(type: string, cb: (ev: unknown) => void) {
    this.listeners.get(type)?.delete(cb);
  }
  close() {
    this.readyState = 3;
  }
  emit(type: string, ev: unknown) {
    this.listeners.get(type)?.forEach((cb) => cb(ev));
  }
  emitOpen() {
    this.readyState = 1;
    this.emit('open', {});
  }
  emitMessage(data: unknown) {
    this.emit('message', { data: JSON.stringify(data) });
  }
}

const WS = MockWebSocket as unknown as typeof WebSocket;

function makeEvent(): EventRecord {
  return {
    id: 'e1',
    type: 'crash',
    severity: 'critical',
    sessionId: 's1',
    timestamp: 1,
    receivedAt: 1,
    payload: {},
  };
}

function makeGroup(): CrashGroupRecord {
  return {
    fingerprint: 'fp1',
    message: 'boom',
    firstSeen: 1,
    lastSeen: 2,
    eventCount: 1,
    sessionCount: 1,
    status: 'new',
  };
}

let ctx: RealtimeContextValue | null = null;
function Capture() {
  ctx = useRealtimeContext();
  return null;
}

function Probe({
  handler,
  kinds,
}: {
  handler: (frame: RealtimeFrame) => void;
  kinds?: RealtimeFrame['kind'][];
}) {
  useRealtimeChannel(handler, kinds ? { kinds } : {});
  return null;
}

function Tree({
  showProbe,
  handler,
  kinds,
  client,
}: {
  showProbe: boolean;
  handler: (frame: RealtimeFrame) => void;
  kinds?: RealtimeFrame['kind'][];
  client: QueryClient;
}) {
  return (
    <QueryClientProvider client={client}>
      <RealtimeProvider url="ws://test/ws/subscribe" webSocketImpl={WS}>
        <Capture />
        {showProbe ? <Probe handler={handler} kinds={kinds} /> : null}
      </RealtimeProvider>
    </QueryClientProvider>
  );
}

describe('RealtimeProvider + useRealtimeChannel', () => {
  beforeEach(() => {
    MockWebSocket.instances = [];
    ctx = null;
    resetUiStore();
  });

  it('opens exactly one socket for the provider lifetime', () => {
    const client = new QueryClient();
    render(<Tree showProbe={false} client={client} handler={() => {}} />);
    expect(MockWebSocket.instances).toHaveLength(1);
  });

  it('registers a subscriber on mount and removes it on unmount (no leak)', () => {
    const client = new QueryClient();
    const { rerender } = render(<Tree showProbe client={client} handler={() => {}} />);
    expect(ctx?.getSubscriberCount()).toBe(1);

    // Route change away from the page → Probe unmounts.
    rerender(<Tree showProbe={false} client={client} handler={() => {}} />);
    expect(ctx?.getSubscriberCount()).toBe(0);
  });

  it('returns to baseline after many mount/unmount cycles without socket churn', () => {
    const client = new QueryClient();
    const { rerender } = render(<Tree showProbe={false} client={client} handler={() => {}} />);

    for (let i = 0; i < 5; i++) {
      rerender(<Tree showProbe client={client} handler={() => {}} />);
      expect(ctx?.getSubscriberCount()).toBe(1);
      rerender(<Tree showProbe={false} client={client} handler={() => {}} />);
      expect(ctx?.getSubscriberCount()).toBe(0);
    }
    // The socket stayed warm across every "navigation".
    expect(MockWebSocket.instances).toHaveLength(1);
  });

  it('dispatches matching frames to subscribers', () => {
    const received: RealtimeFrame[] = [];
    const client = new QueryClient();
    render(<Tree showProbe client={client} handler={(f) => received.push(f)} />);
    const ws = MockWebSocket.instances[0]!;
    act(() => ws.emitOpen());

    const frame: RealtimeFrame = { kind: 'event', event: makeEvent() };
    act(() => ws.emitMessage(frame));

    expect(received).toHaveLength(1);
    expect(received[0]).toEqual(frame);
  });

  it('respects the kinds filter', () => {
    const received: RealtimeFrame[] = [];
    const client = new QueryClient();
    render(
      <Tree
        showProbe
        client={client}
        handler={(f) => received.push(f)}
        kinds={['crash-group-update']}
      />,
    );
    const ws = MockWebSocket.instances[0]!;
    act(() => ws.emitOpen());

    act(() => ws.emitMessage({ kind: 'event', event: makeEvent() })); // filtered out
    act(() => ws.emitMessage({ kind: 'crash-group-update', group: makeGroup() })); // passes

    expect(received).toHaveLength(1);
    expect(received[0]?.kind).toBe('crash-group-update');
  });

  it('invokes the latest handler without re-subscribing', () => {
    const calls: string[] = [];
    const client = new QueryClient();
    const { rerender } = render(
      <Tree showProbe client={client} handler={() => calls.push('h1')} />,
    );
    expect(ctx?.getSubscriberCount()).toBe(1);
    const ws = MockWebSocket.instances[0]!;
    act(() => ws.emitOpen());

    rerender(<Tree showProbe client={client} handler={() => calls.push('h2')} />);
    // Same subscription — no churn from the new handler identity.
    expect(ctx?.getSubscriberCount()).toBe(1);

    act(() => ws.emitMessage({ kind: 'event', event: makeEvent() }));
    expect(calls).toEqual(['h2']);
  });

  it('throws when useRealtimeChannel is used outside a provider', () => {
    expect(() => render(<Probe handler={() => {}} />)).toThrow(/RealtimeProvider/);
  });
});
