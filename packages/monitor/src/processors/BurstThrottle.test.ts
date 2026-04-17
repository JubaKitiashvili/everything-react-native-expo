import { BurstThrottle, defaultBurstKeyFor } from './BurstThrottle';
import type { MonitorEvent, MonitorEventType } from '../types';

function ev(
  type: MonitorEventType | string,
  data: Record<string, unknown> = {},
): MonitorEvent {
  return {
    type: type as MonitorEventType,
    timestamp: 0,
    wallTime: 0,
    sessionId: 's',
    data,
  };
}

describe('BurstThrottle', () => {
  it('passes up to maxPerWindow events per key', () => {
    let now = 1000;
    const t = new BurstThrottle({
      windowMs: 5000,
      maxPerWindow: 3,
      keyFor: (e) => e.type,
      now: () => now,
    });
    expect(t.accept(ev('render'))).toBe(true);
    expect(t.accept(ev('render'))).toBe(true);
    expect(t.accept(ev('render'))).toBe(true);
  });

  it('drops events beyond maxPerWindow', () => {
    let now = 1000;
    const t = new BurstThrottle({
      windowMs: 5000,
      maxPerWindow: 2,
      keyFor: (e) => e.type,
      now: () => now,
    });
    t.accept(ev('render'));
    t.accept(ev('render'));
    expect(t.accept(ev('render'))).toBe(false);
    expect(t.accept(ev('render'))).toBe(false);
  });

  it('resets after window expires', () => {
    let now = 1000;
    const t = new BurstThrottle({
      windowMs: 5000,
      maxPerWindow: 1,
      keyFor: (e) => e.type,
      now: () => now,
    });
    expect(t.accept(ev('render'))).toBe(true);
    expect(t.accept(ev('render'))).toBe(false);
    now += 6000;
    expect(t.accept(ev('render'))).toBe(true);
  });

  it('tracks different keys independently', () => {
    let now = 1000;
    const t = new BurstThrottle({
      windowMs: 5000,
      maxPerWindow: 1,
      keyFor: (e) => `${e.type}:${(e.data as { c?: string }).c ?? ''}`,
      now: () => now,
    });
    expect(t.accept(ev('render', { c: 'A' }))).toBe(true);
    expect(t.accept(ev('render', { c: 'A' }))).toBe(false);
    expect(t.accept(ev('render', { c: 'B' }))).toBe(true);
    expect(t.accept(ev('render', { c: 'B' }))).toBe(false);
  });

  it('null keyFor result means pass through unthrottled', () => {
    const t = new BurstThrottle({
      maxPerWindow: 1,
      keyFor: (e) => (e.type === 'crash' ? null : e.type),
    });
    expect(t.accept(ev('crash'))).toBe(true);
    expect(t.accept(ev('crash'))).toBe(true);
    expect(t.accept(ev('crash'))).toBe(true);
    expect(t.accept(ev('render'))).toBe(true);
    expect(t.accept(ev('render'))).toBe(false);
  });

  it('clear() resets all buckets', () => {
    const t = new BurstThrottle({
      maxPerWindow: 1,
      keyFor: (e) => e.type,
    });
    t.accept(ev('render'));
    expect(t.accept(ev('render'))).toBe(false);
    t.clear();
    expect(t.accept(ev('render'))).toBe(true);
  });

  it('size() returns live bucket count', () => {
    const t = new BurstThrottle({
      keyFor: (e) => e.type,
    });
    expect(t.size()).toBe(0);
    t.accept(ev('render'));
    t.accept(ev('network'));
    expect(t.size()).toBe(2);
  });

  it('evicts expired buckets on next accept', () => {
    let now = 1000;
    const t = new BurstThrottle({
      windowMs: 5000,
      keyFor: (e) => e.type,
      now: () => now,
    });
    t.accept(ev('render'));
    expect(t.size()).toBe(1);
    now += 6000;
    t.accept(ev('network'));
    expect(t.size()).toBe(1); // render evicted, network added
  });
});

describe('defaultBurstKeyFor', () => {
  it('returns null for critical safety event types', () => {
    expect(defaultBurstKeyFor(ev('crash'))).toBeNull();
    expect(defaultBurstKeyFor(ev('native_anr'))).toBeNull();
    expect(defaultBurstKeyFor(ev('interrupted_span'))).toBeNull();
    expect(defaultBurstKeyFor(ev('startup'))).toBeNull();
  });

  it('groups renders by componentName', () => {
    expect(
      defaultBurstKeyFor(ev('render', { componentName: 'UserCard' })),
    ).toBe('render:UserCard');
    expect(
      defaultBurstKeyFor(ev('render', { componentName: 'UserCard' })),
    ).toBe(defaultBurstKeyFor(ev('render', { componentName: 'UserCard' })));
  });

  it('groups navigation by (screen ← previousScreen)', () => {
    expect(
      defaultBurstKeyFor(
        ev('navigation', { screen: 'Profile', previousScreen: 'Home' }),
      ),
    ).toBe('navigation:Profile←Home');
  });

  it('normalizes network URLs by stripping query + numeric ids', () => {
    expect(
      defaultBurstKeyFor(
        ev('network', {
          method: 'GET',
          url: 'https://api.example.com/users/123?foo=bar',
        }),
      ),
    ).toBe('network:GET https://api.example.com/users/:id');
    expect(
      defaultBurstKeyFor(
        ev('network', {
          method: 'GET',
          url: 'https://api.example.com/users/456?bar=baz',
        }),
      ),
    ).toBe('network:GET https://api.example.com/users/:id');
  });

  it('groups custom by name, state by storeName', () => {
    expect(defaultBurstKeyFor(ev('custom', { name: 'signup' }))).toBe(
      'custom:signup',
    );
    expect(defaultBurstKeyFor(ev('state', { storeName: 'auth' }))).toBe(
      'state:auth',
    );
  });

  it('returns type for unknown event types', () => {
    expect(defaultBurstKeyFor(ev('unknown_type'))).toBe('unknown_type:unknown_type');
  });

  it('handles missing fields gracefully', () => {
    expect(defaultBurstKeyFor(ev('render', {}))).toBe('render:');
    expect(defaultBurstKeyFor(ev('network', {}))).toBe('network: ');
  });
});
