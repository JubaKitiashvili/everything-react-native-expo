import {
  PluginRegistry,
  validatePlugin,
  type MonitorPlugin,
  type PluginType,
} from './PluginRegistry';
import { PluginLoader, type PluginResolver } from './PluginLoader';
import { SignalBus } from '../core/SignalBus';
import type { MonitorEvent } from '../types';

// ────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────

function createPlugin(overrides?: Partial<MonitorPlugin>): MonitorPlugin {
  return {
    name: 'test-plugin',
    version: '1.0.0',
    type: 'collector',
    init: () => {},
    dispose: () => {},
    ...overrides,
  };
}

// ────────────────────────────────────────────────────────────
// validatePlugin tests
// ────────────────────────────────────────────────────────────

describe('validatePlugin', () => {
  test('returns null for valid plugin', () => {
    expect(validatePlugin(createPlugin())).toBeNull();
  });

  test('rejects non-object', () => {
    expect(validatePlugin(null)).toBe('Plugin must be an object');
    expect(validatePlugin('string')).toBe('Plugin must be an object');
  });

  test('rejects invalid name', () => {
    expect(validatePlugin(createPlugin({ name: 'A' }))).toContain('name');
    expect(validatePlugin(createPlugin({ name: '' }))).toContain('name');
    expect(validatePlugin(createPlugin({ name: 'UPPERCASE' }))).toContain('name');
  });

  test('rejects invalid version', () => {
    expect(validatePlugin(createPlugin({ version: 'abc' }))).toContain('version');
    expect(validatePlugin(createPlugin({ version: '' }))).toContain('version');
  });

  test('rejects invalid type', () => {
    expect(validatePlugin(createPlugin({ type: 'invalid' as PluginType }))).toContain('type');
  });

  test('rejects missing init', () => {
    const p = { name: 'test-plugin', version: '1.0.0', type: 'collector', dispose: () => {} };
    expect(validatePlugin(p)).toContain('init');
  });

  test('rejects missing dispose', () => {
    const p = { name: 'test-plugin', version: '1.0.0', type: 'collector', init: () => {} };
    expect(validatePlugin(p)).toContain('dispose');
  });
});

// ────────────────────────────────────────────────────────────
// PluginRegistry tests
// ────────────────────────────────────────────────────────────

describe('PluginRegistry', () => {
  test('registers a valid plugin', () => {
    const bus = new SignalBus();
    const registry = new PluginRegistry({ signalBus: bus });

    const error = registry.register(createPlugin());
    expect(error).toBeNull();
    expect(registry.size).toBe(1);
  });

  test('returns error for invalid plugin', () => {
    const bus = new SignalBus();
    const registry = new PluginRegistry({ signalBus: bus });

    const error = registry.register(createPlugin({ name: '' }));
    expect(error).not.toBeNull();
    expect(registry.size).toBe(0);
  });

  test('prevents duplicate registration', () => {
    const bus = new SignalBus();
    const registry = new PluginRegistry({ signalBus: bus });

    registry.register(createPlugin());
    const error = registry.register(createPlugin());
    expect(error).toContain('already registered');
  });

  test('enforces max plugins limit', () => {
    const bus = new SignalBus();
    const registry = new PluginRegistry({ signalBus: bus, maxPlugins: 2 });

    registry.register(createPlugin({ name: 'plugin-a' }));
    registry.register(createPlugin({ name: 'plugin-b' }));
    const error = registry.register(createPlugin({ name: 'plugin-c' }));
    expect(error).toContain('limit');
  });

  test('calls init with SignalBus', () => {
    const bus = new SignalBus();
    const registry = new PluginRegistry({ signalBus: bus });
    let receivedBus: SignalBus | null = null;

    registry.register(
      createPlugin({
        init: (b) => {
          receivedBus = b;
        },
      }),
    );

    expect(receivedBus).toBe(bus);
  });

  test('marks plugin unhealthy if init throws', () => {
    const bus = new SignalBus();
    const registry = new PluginRegistry({ signalBus: bus });

    registry.register(
      createPlugin({
        init: () => {
          throw new Error('init failed');
        },
      }),
    );

    const reg = registry.get('test-plugin');
    expect(reg).not.toBeNull();
    expect(reg!.healthy).toBe(false);
  });

  test('unregisters and disposes plugin', () => {
    const bus = new SignalBus();
    const registry = new PluginRegistry({ signalBus: bus });
    let disposed = false;

    registry.register(
      createPlugin({
        dispose: () => {
          disposed = true;
        },
      }),
    );

    const result = registry.unregister('test-plugin');
    expect(result).toBe(true);
    expect(disposed).toBe(true);
    expect(registry.size).toBe(0);
  });

  test('unregister returns false for unknown plugin', () => {
    const bus = new SignalBus();
    const registry = new PluginRegistry({ signalBus: bus });
    expect(registry.unregister('nope')).toBe(false);
  });

  test('get returns null for unknown plugin', () => {
    const bus = new SignalBus();
    const registry = new PluginRegistry({ signalBus: bus });
    expect(registry.get('nope')).toBeNull();
  });

  test('getAll returns all registrations', () => {
    const bus = new SignalBus();
    const registry = new PluginRegistry({ signalBus: bus });

    registry.register(createPlugin({ name: 'plugin-a' }));
    registry.register(createPlugin({ name: 'plugin-b' }));

    expect(registry.getAll()).toHaveLength(2);
  });

  test('getByType filters by plugin type', () => {
    const bus = new SignalBus();
    const registry = new PluginRegistry({ signalBus: bus });

    registry.register(createPlugin({ name: 'coll', type: 'collector' }));
    registry.register(createPlugin({ name: 'trans', type: 'transport' }));
    registry.register(createPlugin({ name: 'coll2', type: 'collector' }));

    expect(registry.getByType('collector')).toHaveLength(2);
    expect(registry.getByType('transport')).toHaveLength(1);
    expect(registry.getByType('processor')).toHaveLength(0);
  });

  test('disposeAll clears all plugins', () => {
    const bus = new SignalBus();
    const registry = new PluginRegistry({ signalBus: bus });
    const disposed: string[] = [];

    registry.register(createPlugin({ name: 'aa', dispose: () => disposed.push('aa') }));
    registry.register(createPlugin({ name: 'bb', dispose: () => disposed.push('bb') }));

    registry.disposeAll();
    expect(registry.size).toBe(0);
    expect(disposed).toEqual(['aa', 'bb']);
  });

  test('plugin can emit events via signalBus', () => {
    const bus = new SignalBus();
    const events: MonitorEvent[] = [];
    bus.onAll((e) => events.push(e));

    const registry = new PluginRegistry({ signalBus: bus });
    registry.register(
      createPlugin({
        init: (signalBus) => {
          signalBus.emit({
            type: 'custom',
            timestamp: 0,
            wallTime: 0,
            sessionId: '',
            data: { name: 'from-plugin' },
          });
        },
      }),
    );

    expect(events).toHaveLength(1);
    expect((events[0]!.data as { name: string }).name).toBe('from-plugin');
  });
});

// ────────────────────────────────────────────────────────────
// PluginLoader tests
// ────────────────────────────────────────────────────────────

describe('PluginLoader', () => {
  function createFakeResolver(
    plugins: Record<string, MonitorPlugin | Error>,
  ): PluginResolver {
    return {
      async resolve(moduleName: string): Promise<MonitorPlugin> {
        const result = plugins[moduleName];
        if (!result) throw new Error(`Module not found: ${moduleName}`);
        if (result instanceof Error) throw result;
        return result;
      },
    };
  }

  test('loads plugin successfully', async () => {
    const bus = new SignalBus();
    const registry = new PluginRegistry({ signalBus: bus });
    const resolver = createFakeResolver({
      'my-plugin': createPlugin({ name: 'my-plugin' }),
    });

    const loader = new PluginLoader(resolver, registry);
    const result = await loader.load('my-plugin');

    expect(result.success).toBe(true);
    expect(result.name).toBe('my-plugin');
    expect(registry.size).toBe(1);
  });

  test('reports error for unresolvable module', async () => {
    const bus = new SignalBus();
    const registry = new PluginRegistry({ signalBus: bus });
    const resolver = createFakeResolver({});

    const loader = new PluginLoader(resolver, registry);
    const result = await loader.load('nonexistent');

    expect(result.success).toBe(false);
    expect(result.error).toContain('not found');
  });

  test('reports error for invalid plugin interface', async () => {
    const bus = new SignalBus();
    const registry = new PluginRegistry({ signalBus: bus });
    const badPlugin = { name: 'bad', version: '1.0.0', type: 'collector' } as unknown as MonitorPlugin;
    const resolver = createFakeResolver({ bad: badPlugin });

    const loader = new PluginLoader(resolver, registry);
    const result = await loader.load('bad');

    expect(result.success).toBe(false);
    expect(result.error).toContain('interface');
  });

  test('loadAll processes multiple configs', async () => {
    const bus = new SignalBus();
    const registry = new PluginRegistry({ signalBus: bus });
    const resolver = createFakeResolver({
      'plug-a': createPlugin({ name: 'plug-a' }),
      'plug-b': createPlugin({ name: 'plug-b' }),
    });

    const loader = new PluginLoader(resolver, registry);
    const results = await loader.loadAll([{ name: 'plug-a' }, { name: 'plug-b' }, { name: 'missing' }]);

    expect(results).toHaveLength(3);
    expect(results[0]!.success).toBe(true);
    expect(results[1]!.success).toBe(true);
    expect(results[2]!.success).toBe(false);
    expect(registry.size).toBe(2);
  });
});
