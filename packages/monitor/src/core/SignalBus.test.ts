import { SignalBus } from './SignalBus';
import type { MonitorEvent, MonitorEventType } from '../types';

function makeEvent(
  type: MonitorEventType,
  data: unknown = {},
): MonitorEvent {
  return {
    type,
    timestamp: SignalBus.now(),
    wallTime: Date.now(),
    sessionId: 'test-session',
    data,
  };
}

describe('SignalBus', () => {
  afterEach(() => {
    const g = globalThis as { __erne_signal_bus_errors__?: unknown[] };
    delete g.__erne_signal_bus_errors__;
  });

  describe('on / emit', () => {
    it('delivers events to matching type handlers', () => {
      const bus = new SignalBus();
      const crashes: MonitorEvent[] = [];
      bus.on('crash', (e) => crashes.push(e));
      const evt = makeEvent('crash', { msg: 'boom' });
      bus.emit(evt);
      expect(crashes).toEqual([evt]);
    });

    it('does not deliver to unrelated types', () => {
      const bus = new SignalBus();
      const network: MonitorEvent[] = [];
      bus.on('network', (e) => network.push(e));
      bus.emit(makeEvent('crash'));
      expect(network).toHaveLength(0);
    });

    it('returns an unsubscribe function', () => {
      const bus = new SignalBus();
      const received: MonitorEvent[] = [];
      const unsub = bus.on('crash', (e) => received.push(e));
      bus.emit(makeEvent('crash'));
      unsub();
      bus.emit(makeEvent('crash'));
      expect(received).toHaveLength(1);
    });

    it('allows multiple subscribers on the same type', () => {
      const bus = new SignalBus();
      let a = 0;
      let b = 0;
      bus.on('crash', () => a++);
      bus.on('crash', () => b++);
      bus.emit(makeEvent('crash'));
      bus.emit(makeEvent('crash'));
      expect(a).toBe(2);
      expect(b).toBe(2);
    });
  });

  describe('onAll', () => {
    it('receives every event regardless of type', () => {
      const bus = new SignalBus();
      const all: MonitorEvent[] = [];
      bus.onAll((e) => all.push(e));
      bus.emit(makeEvent('crash'));
      bus.emit(makeEvent('network'));
      bus.emit(makeEvent('navigation'));
      expect(all.map((e) => e.type)).toEqual([
        'crash',
        'network',
        'navigation',
      ]);
    });

    it('unsubscribe function works', () => {
      const bus = new SignalBus();
      let count = 0;
      const unsub = bus.onAll(() => count++);
      bus.emit(makeEvent('crash'));
      unsub();
      bus.emit(makeEvent('crash'));
      expect(count).toBe(1);
    });
  });

  describe('off', () => {
    it('removes a specific handler without affecting others', () => {
      const bus = new SignalBus();
      let a = 0;
      let b = 0;
      const ha = () => a++;
      const hb = () => b++;
      bus.on('crash', ha);
      bus.on('crash', hb);
      bus.off('crash', ha);
      bus.emit(makeEvent('crash'));
      expect(a).toBe(0);
      expect(b).toBe(1);
    });

    it('is safe to call for unknown handlers', () => {
      const bus = new SignalBus();
      expect(() => bus.off('crash', () => {})).not.toThrow();
    });
  });

  describe('clear', () => {
    it('removes all typed and wildcard subscribers', () => {
      const bus = new SignalBus();
      bus.on('crash', () => {});
      bus.onAll(() => {});
      expect(bus.listenerCount()).toBeGreaterThan(0);
      bus.clear();
      expect(bus.listenerCount()).toBe(0);
    });
  });

  describe('error isolation', () => {
    it('a throwing handler does not prevent others from running', () => {
      const bus = new SignalBus();
      const calls: string[] = [];
      bus.on('crash', () => {
        calls.push('before');
        throw new Error('handler exploded');
      });
      bus.on('crash', () => {
        calls.push('after');
      });
      bus.emit(makeEvent('crash'));
      expect(calls).toEqual(['before', 'after']);
      const g = globalThis as { __erne_signal_bus_errors__?: unknown[] };
      expect(g.__erne_signal_bus_errors__).toHaveLength(1);
    });

    it('a throwing wildcard handler does not block typed handlers', () => {
      const bus = new SignalBus();
      let typed = 0;
      bus.onAll(() => {
        throw new Error('wildcard exploded');
      });
      bus.on('crash', () => typed++);
      bus.emit(makeEvent('crash'));
      expect(typed).toBe(1);
    });
  });

  describe('snapshot semantics', () => {
    it('handlers added during dispatch do not fire for the current event', () => {
      const bus = new SignalBus();
      const calls: string[] = [];
      bus.on('crash', () => {
        calls.push('first');
        bus.on('crash', () => calls.push('second'));
      });
      bus.emit(makeEvent('crash'));
      expect(calls).toEqual(['first']);
      bus.emit(makeEvent('crash'));
      expect(calls).toEqual(['first', 'first', 'second']);
    });

    it('handlers that unsubscribe themselves mid-dispatch do not crash', () => {
      const bus = new SignalBus();
      const calls: string[] = [];
      const unsub = bus.on('crash', () => {
        calls.push('self');
        unsub();
      });
      bus.on('crash', () => calls.push('other'));
      bus.emit(makeEvent('crash'));
      bus.emit(makeEvent('crash'));
      expect(calls).toEqual(['self', 'other', 'other']);
    });
  });

  describe('now()', () => {
    it('returns a finite, monotonic-looking number', () => {
      const a = SignalBus.now();
      const b = SignalBus.now();
      expect(Number.isFinite(a)).toBe(true);
      expect(Number.isFinite(b)).toBe(true);
      expect(b).toBeGreaterThanOrEqual(a);
    });
  });

  describe('listenerCount', () => {
    it('counts total and per-type subscribers', () => {
      const bus = new SignalBus();
      bus.on('crash', () => {});
      bus.on('crash', () => {});
      bus.on('network', () => {});
      bus.onAll(() => {});
      expect(bus.listenerCount('crash')).toBe(2 + 1); // typed + wildcard
      expect(bus.listenerCount('network')).toBe(1 + 1);
      expect(bus.listenerCount()).toBe(2 + 1 + 1); // 2 crash + 1 network + 1 wildcard
    });
  });
});
