/**
 * Task 68 — Server Plugin Marketplace Registry
 *
 * Server registry: list plugins, search, metadata (name, description,
 * version, downloads).
 */

// ────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────

export interface MarketplacePlugin {
  readonly name: string;
  readonly description: string;
  readonly version: string;
  readonly author: string;
  readonly type: string;
  readonly downloads: number;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly tags: readonly string[];
}

export interface MarketplaceSearchOptions {
  readonly query?: string;
  readonly type?: string;
  readonly tag?: string;
  readonly sortBy?: 'downloads' | 'name' | 'updatedAt';
  readonly limit?: number;
  readonly offset?: number;
}

export interface MarketplaceStore {
  findAll(options: MarketplaceSearchOptions): Promise<readonly MarketplacePlugin[]>;
  findByName(name: string): Promise<MarketplacePlugin | null>;
  register(plugin: Omit<MarketplacePlugin, 'downloads' | 'createdAt' | 'updatedAt'>): Promise<MarketplacePlugin>;
  incrementDownloads(name: string): Promise<void>;
  count(options?: MarketplaceSearchOptions): Promise<number>;
}

// ────────────────────────────────────────────────────────────
// Service
// ────────────────────────────────────────────────────────────

export class MarketplaceRegistry {
  constructor(private readonly store: MarketplaceStore) {}

  async list(options?: MarketplaceSearchOptions): Promise<readonly MarketplacePlugin[]> {
    return this.store.findAll(options ?? {});
  }

  async search(query: string, options?: Omit<MarketplaceSearchOptions, 'query'>): Promise<readonly MarketplacePlugin[]> {
    return this.store.findAll({ ...options, query });
  }

  async getPlugin(name: string): Promise<MarketplacePlugin | null> {
    return this.store.findByName(name);
  }

  async publish(
    plugin: Omit<MarketplacePlugin, 'downloads' | 'createdAt' | 'updatedAt'>,
  ): Promise<MarketplacePlugin> {
    return this.store.register(plugin);
  }

  async trackDownload(name: string): Promise<void> {
    await this.store.incrementDownloads(name);
  }

  async count(options?: MarketplaceSearchOptions): Promise<number> {
    return this.store.count(options);
  }
}
