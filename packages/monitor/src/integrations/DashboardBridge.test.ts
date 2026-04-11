import {
  DashboardBridge,
  type WebSocketCtor,
  type WebSocketLike,
} from './DashboardBridge';
import { SignalBus } from '../core/SignalBus';
import type { MonitorEvent } from '../types';

function evt(): MonitorEvent {
  return {
    type: 'custom',
    timestamp: 0,
    wallTime: 0,
    sessionId: 'test',
    data: { name: 'x', attributes: {} },
  };
}

class FakeWebSocket implements WebSocketLike {
  readyState = 0;
  onopen: ((ev: unknown) => void) | null = null;
  onerror: ((ev: unknown) => void) | null = null;
  onclose: ((ev: unknown) => void) | null = null;
  onmessage: ((ev: { data: unknown }) => void) | null = null;
  sent: string[] = [];

  static instances: FakeWebSocket[] = [];

  url: string;

  constructor(url: string) {
    this.url = url;
    FakeWebSocket.instances.push(this);
  }

  send(data: string): void {
    if (this.readyState !== 1) throw new Error('not open');
    this.sent.push(data);
  }
  close(): void {
    this.readyState = 3;
    this.onclose?.({});
  }
  open(): void {
    this.readyState = 1;
    this.onopen?.({});
  }
  fail(): void {
    this.onerror?.(new Error('fail'));
    this.readyState = 3;
    this.onclose?.({});
  }
}

const FakeCtor: WebSocketCtor = FakeWebSocket as unknown as WebSocketCtor;

describe('DashboardBridge', () => {
  beforeEach(() => {
    FakeWebSocket.instances = [];
  });

  it('is a no-op outside dev', () => {
    const bus = new SignalBus();
    const bridge = new DashboardBridge({
      signalBus: bus,
      url: 'ws://x',
      isDev: false,
      WebSocket: FakeCtor,
    });
    bridge.start();
    expect(FakeWebSocket.instances).toHaveLength(0);
    expect(bridge.isConnected()).toBe(false);
  });

  it('is a no-op when no WebSocket constructor is available', () => {
    const bus = new SignalBus();
    const bridge = new DashboardBridge({
      signalBus: bus,
      url: 'ws://x',
      isDev: true,
      WebSocket: null,
    });
    bridge.start();
    expect(bridge.isConnected()).toBe(false);
  });

  it('sends hello on open then streams events', () => {
    const bus = new SignalBus();
    const bridge = new DashboardBridge({
      signalBus: bus,
      url: 'ws://x',
      isDev: true,
      WebSocket: FakeCtor,
      clientId: 'c1',
    });
    bridge.start();
    const ws = FakeWebSocket.instances[0]!;
    ws.open();
    bus.emit(evt());
    expect(ws.sent).toHaveLength(2);
    const hello = JSON.parse(ws.sent[0]!);
    const payload = JSON.parse(ws.sent[1]!);
    expect(hello.type).toBe('monitor:hello');
    expect(hello.clientId).toBe('c1');
    expect(payload.type).toBe('monitor:event');
    expect(payload.event.type).toBe('custom');
  });

  it('buffers events while offline and drains on reconnect', () => {
    jest.useFakeTimers();
    try {
      const bus = new SignalBus();
      const bridge = new DashboardBridge({
        signalBus: bus,
        url: 'ws://x',
        isDev: true,
        WebSocket: FakeCtor,
        reconnectDelayMs: 10,
        bufferSize: 10,
      });
      bridge.start();
      const ws1 = FakeWebSocket.instances[0]!;
      // Emit while the first socket is still connecting — events buffer.
      bus.emit(evt());
      bus.emit(evt());
      expect(bridge.bufferedCount()).toBe(2);
      // Fail connection immediately. onclose triggers reconnect schedule.
      ws1.fail();
      // Advance fake timers past the reconnect delay.
      jest.advanceTimersByTime(20);
      expect(FakeWebSocket.instances.length).toBeGreaterThanOrEqual(2);
      const ws2 = FakeWebSocket.instances[FakeWebSocket.instances.length - 1]!;
      ws2.open();
      // Hello + 2 buffered events = 3 messages.
      expect(ws2.sent.length).toBeGreaterThanOrEqual(3);
      const types = ws2.sent.map((s) => JSON.parse(s).type);
      expect(types[0]).toBe('monitor:hello');
      expect(types.filter((t) => t === 'monitor:event')).toHaveLength(2);
      bridge.stop();
    } finally {
      jest.useRealTimers();
    }
  });

  it('stop() unsubscribes and closes the socket', () => {
    const bus = new SignalBus();
    const bridge = new DashboardBridge({
      signalBus: bus,
      url: 'ws://x',
      isDev: true,
      WebSocket: FakeCtor,
    });
    bridge.start();
    const ws = FakeWebSocket.instances[0]!;
    ws.open();
    bridge.stop();
    // Post-stop events should not be sent.
    bus.emit(evt());
    // ws.sent should still have hello (no event after stop).
    expect(ws.sent.filter((s) => s.includes('monitor:event'))).toHaveLength(0);
  });

  it('drops oldest buffered events when bufferSize exceeded', () => {
    const bus = new SignalBus();
    const bridge = new DashboardBridge({
      signalBus: bus,
      url: 'ws://x',
      isDev: true,
      WebSocket: FakeCtor,
      bufferSize: 3,
    });
    bridge.start();
    // Never open the socket. All emits land in the buffer.
    for (let i = 0; i < 5; i++) bus.emit(evt());
    expect(bridge.bufferedCount()).toBeLessThanOrEqual(3);
  });
});
