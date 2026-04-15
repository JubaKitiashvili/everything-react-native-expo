/**
 * Task 68 — Plugin Loader
 *
 * Resolves plugins from node_modules (injectable resolver for tests).
 * Health check on load.
 */

import type { MonitorPlugin, PluginRegistry } from './PluginRegistry';

// ────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────

export interface PluginResolver {
  resolve(moduleName: string): Promise<MonitorPlugin>;
}

export interface PluginConfig {
  readonly name: string;
  readonly options?: Record<string, unknown>;
}

export interface PluginLoadResult {
  readonly name: string;
  readonly success: boolean;
  readonly error?: string;
}

// ────────────────────────────────────────────────────────────
// Loader
// ────────────────────────────────────────────────────────────

export class PluginLoader {
  constructor(
    private readonly resolver: PluginResolver,
    private readonly registry: PluginRegistry,
  ) {}

  /** Load a single plugin by module name. */
  async load(moduleName: string): Promise<PluginLoadResult> {
    try {
      const plugin = await this.resolver.resolve(moduleName);

      // Health check: verify the plugin has required methods
      if (typeof plugin.init !== 'function' || typeof plugin.dispose !== 'function') {
        return {
          name: moduleName,
          success: false,
          error: 'Plugin does not implement required interface',
        };
      }

      const error = this.registry.register(plugin);
      if (error) {
        return { name: plugin.name, success: false, error };
      }

      return { name: plugin.name, success: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      return { name: moduleName, success: false, error: message };
    }
  }

  /** Load multiple plugins from config array. */
  async loadAll(configs: readonly PluginConfig[]): Promise<readonly PluginLoadResult[]> {
    const results: PluginLoadResult[] = [];
    for (const config of configs) {
      const result = await this.load(config.name);
      results.push(result);
    }
    return results;
  }
}
