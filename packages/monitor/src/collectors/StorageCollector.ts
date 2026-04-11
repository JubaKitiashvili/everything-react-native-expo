import type { Collector, MonitorConfig, MonitorEvent } from '../types';
import type { SignalBus } from '../core/SignalBus';

export type StorageBackend = 'async-storage' | 'sqlite' | 'secure-store';
export type StorageOp = 'get' | 'set' | 'remove' | 'clear' | 'merge' | 'exec';

export interface StorageEventData {
  backend: StorageBackend;
  op: StorageOp;
  durationMs: number;
  keyOrStatement?: string;
  valueSize?: number;
  warning?: string;
}

export interface AsyncStorageLike {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
  clear?(): Promise<void>;
  mergeItem?(key: string, value: string): Promise<void>;
}

export interface StorageCollectorDeps {
  signalBus: SignalBus;
  /** Warn threshold — ops/second across all backends. Default 100. */
  warnOpsPerSecond?: number;
  /** Warn threshold — single value size in bytes. Default 512_000. */
  warnValueSize?: number;
  now?: () => number;
  wallNow?: () => number;
}

/**
 * StorageCollector monkey-patches AsyncStorage and provides a manual
 * `record()` API for expo-sqlite / expo-secure-store integrations. It
 * captures operation type, duration, key, and payload size, and emits
 * warnings when pressure thresholds are crossed.
 */
export class StorageCollector implements Collector {
  readonly name = 'storage';
  readonly priority = 85;

  private readonly deps: StorageCollectorDeps;
  private readonly warnOpsPerSecond: number;
  private readonly warnValueSize: number;
  private readonly now: () => number;
  private readonly wallNow: () => number;

  private running = false;
  private windowStart = 0;
  private windowCount = 0;

  private asyncStorage: AsyncStorageLike | null = null;
  private originals: Partial<Record<keyof AsyncStorageLike, unknown>> = {};

  constructor(deps: StorageCollectorDeps) {
    this.deps = deps;
    this.warnOpsPerSecond = deps.warnOpsPerSecond ?? 100;
    this.warnValueSize = deps.warnValueSize ?? 512_000;
    this.now =
      deps.now ??
      (() =>
        typeof performance !== 'undefined' &&
        typeof performance.now === 'function'
          ? performance.now()
          : Date.now());
    this.wallNow = deps.wallNow ?? Date.now;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  init(_config: MonitorConfig): void {}

  start(): void {
    this.running = true;
  }

  stop(): void {
    this.running = false;
    this.unpatchAsyncStorage();
  }

  dispose(): void {
    this.stop();
  }

  isRunning(): boolean {
    return this.running;
  }

  /**
   * Host apps call this once with their AsyncStorage instance. The
   * collector records its original methods and wraps them transparently.
   */
  patchAsyncStorage(module: AsyncStorageLike): void {
    if (!this.running || this.asyncStorage) return;
    this.asyncStorage = module;
    // Capture direct references (not bound) so unpatch restores the
    // exact original function identity. In host AsyncStorage modules
    // methods already use lexical `this` or arrow functions, so no
    // binding is needed.
    this.originals = {
      getItem: module.getItem,
      setItem: module.setItem,
      removeItem: module.removeItem,
      clear: module.clear,
      mergeItem: module.mergeItem,
    };
    const finish = (
      op: StorageOp,
      key: string,
      start: number,
      value?: string,
    ): void => {
      this.record({
        backend: 'async-storage',
        op,
        durationMs: this.now() - start,
        keyOrStatement: key,
        valueSize: value != null ? value.length : undefined,
      });
    };
    module.getItem = async (k: string): Promise<string | null> => {
      const start = this.now();
      const result = await (this.originals.getItem as AsyncStorageLike['getItem'])(k);
      finish('get', k, start);
      return result;
    };
    module.setItem = async (k: string, v: string): Promise<void> => {
      const start = this.now();
      await (this.originals.setItem as AsyncStorageLike['setItem'])(k, v);
      finish('set', k, start, v);
    };
    module.removeItem = async (k: string): Promise<void> => {
      const start = this.now();
      await (this.originals.removeItem as AsyncStorageLike['removeItem'])(k);
      finish('remove', k, start);
    };
    if (this.originals.clear) {
      module.clear = async (): Promise<void> => {
        const start = this.now();
        await (this.originals.clear as NonNullable<AsyncStorageLike['clear']>)();
        finish('clear', '', start);
      };
    }
    if (this.originals.mergeItem) {
      module.mergeItem = async (k: string, v: string): Promise<void> => {
        const start = this.now();
        await (this.originals.mergeItem as NonNullable<
          AsyncStorageLike['mergeItem']
        >)(k, v);
        finish('merge', k, start, v);
      };
    }
  }

  unpatchAsyncStorage(): void {
    if (!this.asyncStorage) return;
    if (this.originals.getItem)
      this.asyncStorage.getItem = this.originals.getItem as AsyncStorageLike['getItem'];
    if (this.originals.setItem)
      this.asyncStorage.setItem = this.originals.setItem as AsyncStorageLike['setItem'];
    if (this.originals.removeItem)
      this.asyncStorage.removeItem =
        this.originals.removeItem as AsyncStorageLike['removeItem'];
    if (this.originals.clear)
      this.asyncStorage.clear = this.originals.clear as AsyncStorageLike['clear'];
    if (this.originals.mergeItem)
      this.asyncStorage.mergeItem =
        this.originals.mergeItem as AsyncStorageLike['mergeItem'];
    this.asyncStorage = null;
    this.originals = {};
  }

  /**
   * Records an arbitrary storage op. expo-sqlite / expo-secure-store
   * integrations call this directly.
   */
  record(info: StorageEventData): void {
    if (!this.running) return;
    const warning = this.assessWarning(info);
    const payload: StorageEventData = warning ? { ...info, warning } : info;
    const event: MonitorEvent = {
      type: 'custom',
      timestamp: this.now(),
      wallTime: this.wallNow(),
      sessionId: '',
      data: {
        name: 'storage',
        attributes: payload as unknown as Record<string, never>,
      },
    };
    this.deps.signalBus.emit(event);
  }

  private assessWarning(info: StorageEventData): string | undefined {
    const now = this.now();
    if (now - this.windowStart > 1000) {
      this.windowStart = now;
      this.windowCount = 0;
    }
    this.windowCount += 1;
    if (this.windowCount > this.warnOpsPerSecond) {
      return `ops-per-second exceeded ${this.warnOpsPerSecond}`;
    }
    if (info.valueSize !== undefined && info.valueSize > this.warnValueSize) {
      return `value size ${info.valueSize} bytes exceeds ${this.warnValueSize}`;
    }
    return undefined;
  }
}
