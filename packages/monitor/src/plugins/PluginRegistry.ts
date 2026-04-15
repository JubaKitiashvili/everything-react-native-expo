/**
 * Task 68 — Plugin/Extension Registry
 *
 * Plugin interface: { name, version, type, init(bus), dispose() }.
 * Registration, validation, sandboxing (plugins only get SignalBus +
 * public API). Dynamic loading from config.plugins array.
 */

import type { SignalBus } from '../core/SignalBus';

// ────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────

export type PluginType = 'collector' | 'processor' | 'transport' | 'integration';

export interface MonitorPlugin {
  readonly name: string;
  readonly version: string;
  readonly type: PluginType;
  init(bus: SignalBus): void;
  dispose(): void;
}

export interface PluginRegistration {
  readonly plugin: MonitorPlugin;
  readonly loadedAt: number;
  readonly healthy: boolean;
}

export interface PluginRegistryDeps {
  signalBus: SignalBus;
  /** Clock. */
  now?: () => number;
  /** Max plugins allowed. Default 50. */
  maxPlugins?: number;
}

// ────────────────────────────────────────────────────────────
// Validation
// ────────────────────────────────────────────────────────────

const NAME_PATTERN = /^[a-z][a-z0-9_-]{1,63}$/;
const VERSION_PATTERN = /^\d+\.\d+\.\d+/;
const VALID_TYPES: readonly PluginType[] = ['collector', 'processor', 'transport', 'integration'];

export function validatePlugin(plugin: unknown): string | null {
  if (!plugin || typeof plugin !== 'object') return 'Plugin must be an object';

  const p = plugin as Record<string, unknown>;

  if (typeof p['name'] !== 'string' || !NAME_PATTERN.test(p['name'])) {
    return 'Plugin name must be lowercase alphanumeric with hyphens/underscores, 2-64 chars';
  }

  if (typeof p['version'] !== 'string' || !VERSION_PATTERN.test(p['version'])) {
    return 'Plugin version must be semver (e.g., 1.0.0)';
  }

  if (!VALID_TYPES.includes(p['type'] as PluginType)) {
    return `Plugin type must be one of: ${VALID_TYPES.join(', ')}`;
  }

  if (typeof p['init'] !== 'function') return 'Plugin must have an init(bus) method';
  if (typeof p['dispose'] !== 'function') return 'Plugin must have a dispose() method';

  return null;
}

// ────────────────────────────────────────────────────────────
// Registry
// ────────────────────────────────────────────────────────────

export class PluginRegistry {
  private readonly deps: PluginRegistryDeps;
  private readonly maxPlugins: number;
  private readonly now: () => number;
  private readonly registrations = new Map<string, PluginRegistration>();

  constructor(deps: PluginRegistryDeps) {
    this.deps = deps;
    this.maxPlugins = deps.maxPlugins ?? 50;
    this.now = deps.now ?? Date.now;
  }

  /** Register and initialize a plugin. Returns validation error or null. */
  register(plugin: MonitorPlugin): string | null {
    const error = validatePlugin(plugin);
    if (error) return error;

    if (this.registrations.has(plugin.name)) {
      return `Plugin "${plugin.name}" is already registered`;
    }

    if (this.registrations.size >= this.maxPlugins) {
      return `Maximum plugin limit (${this.maxPlugins}) reached`;
    }

    // Sandboxed init — plugin only gets the SignalBus
    let healthy = true;
    try {
      plugin.init(this.deps.signalBus);
    } catch {
      healthy = false;
    }

    this.registrations.set(plugin.name, {
      plugin,
      loadedAt: this.now(),
      healthy,
    });

    return null;
  }

  /** Unregister and dispose a plugin. */
  unregister(name: string): boolean {
    const reg = this.registrations.get(name);
    if (!reg) return false;

    try {
      reg.plugin.dispose();
    } catch {
      // Best-effort disposal
    }

    this.registrations.delete(name);
    return true;
  }

  /** Get a specific plugin registration. */
  get(name: string): PluginRegistration | null {
    return this.registrations.get(name) ?? null;
  }

  /** Get all registered plugins. */
  getAll(): readonly PluginRegistration[] {
    return [...this.registrations.values()];
  }

  /** Get plugins by type. */
  getByType(type: PluginType): readonly PluginRegistration[] {
    return [...this.registrations.values()].filter((r) => r.plugin.type === type);
  }

  /** Dispose all plugins and clear the registry. */
  disposeAll(): void {
    for (const reg of this.registrations.values()) {
      try {
        reg.plugin.dispose();
      } catch {
        // Best-effort
      }
    }
    this.registrations.clear();
  }

  /** Number of registered plugins. */
  get size(): number {
    return this.registrations.size;
  }
}
