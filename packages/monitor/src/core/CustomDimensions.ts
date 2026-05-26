export type DimensionValue = string | number | boolean;

export interface CustomDimensionsOptions {
  /** Max number of distinct dimension keys. Default 32. */
  maxKeys?: number;
  /** Max string length for a key. Default 256. */
  maxKeyLength?: number;
  /** Max string length for a string value. Default 256. */
  maxValueLength?: number;
  /** Console-like sink for warnings. Defaults to globalThis.console. */
  console?: Pick<Console, 'warn'> | null;
}

export const CUSTOM_DIMENSION_LIMITS = Object.freeze({
  maxKeys: 32,
  maxKeyLength: 256,
  maxValueLength: 256,
});

/**
 * CustomDimensions is a small in-memory store for user-defined slicing
 * dimensions / user properties. Values set here are attached to outgoing
 * events as a `dimensions` field by the enrichment path.
 *
 * Enforcement:
 *   - at most `maxKeys` (default 32) distinct keys — extra keys are dropped
 *   - keys longer than `maxKeyLength` (default 256) are dropped
 *   - string values longer than `maxValueLength` (default 256) are dropped
 *   - non-primitive values are dropped
 * Every drop emits a single `console.warn` so the developer can see it
 * without crashing the app.
 */
export class CustomDimensions {
  private readonly maxKeys: number;
  private readonly maxKeyLength: number;
  private readonly maxValueLength: number;
  private readonly console: Pick<Console, 'warn'> | null;
  private readonly dimensions = new Map<string, DimensionValue>();

  constructor(options: CustomDimensionsOptions = {}) {
    this.maxKeys = options.maxKeys ?? CUSTOM_DIMENSION_LIMITS.maxKeys;
    this.maxKeyLength =
      options.maxKeyLength ?? CUSTOM_DIMENSION_LIMITS.maxKeyLength;
    this.maxValueLength =
      options.maxValueLength ?? CUSTOM_DIMENSION_LIMITS.maxValueLength;
    this.console =
      options.console === null
        ? null
        : (options.console ?? (globalThis.console as Pick<Console, 'warn'>));
  }

  /**
   * Sets a single dimension. Returns true when stored, false when the key
   * or value was rejected by the limits.
   */
  setDimension(key: string, value: DimensionValue): boolean {
    if (typeof key !== 'string' || key.length === 0) {
      this.warn(`dropped dimension — key must be a non-empty string`);
      return false;
    }
    if (key.length > this.maxKeyLength) {
      this.warn(
        `dropped dimension "${key.slice(0, 32)}…" — key exceeds ${this.maxKeyLength} chars`,
      );
      return false;
    }
    if (
      typeof value !== 'string' &&
      typeof value !== 'number' &&
      typeof value !== 'boolean'
    ) {
      this.warn(
        `dropped dimension "${key}" — value must be string | number | boolean`,
      );
      return false;
    }
    if (typeof value === 'number' && !Number.isFinite(value)) {
      this.warn(`dropped dimension "${key}" — value must be a finite number`);
      return false;
    }
    if (typeof value === 'string' && value.length > this.maxValueLength) {
      this.warn(
        `dropped dimension "${key}" — value exceeds ${this.maxValueLength} chars`,
      );
      return false;
    }
    // Updating an existing key never trips the key-count cap.
    if (!this.dimensions.has(key) && this.dimensions.size >= this.maxKeys) {
      this.warn(
        `dropped dimension "${key}" — key count exceeds ${this.maxKeys}`,
      );
      return false;
    }
    this.dimensions.set(key, value);
    return true;
  }

  /**
   * Bulk-sets user properties. Each entry is validated independently via
   * `setDimension`, so a single bad entry doesn't reject the whole batch.
   * Returns the number of properties accepted.
   */
  setUserProperties(props: Record<string, DimensionValue>): number {
    if (typeof props !== 'object' || props === null) {
      this.warn('setUserProperties — argument must be an object');
      return 0;
    }
    let accepted = 0;
    for (const key of Object.keys(props)) {
      if (this.setDimension(key, props[key] as DimensionValue)) {
        accepted += 1;
      }
    }
    return accepted;
  }

  /** Returns a shallow snapshot of the current dimensions. */
  getDimensions(): Record<string, DimensionValue> {
    const out: Record<string, DimensionValue> = {};
    for (const [k, v] of this.dimensions) out[k] = v;
    return out;
  }

  /** Removes a single dimension. Returns true when it existed. */
  removeDimension(key: string): boolean {
    return this.dimensions.delete(key);
  }

  /** Clears all dimensions. */
  clear(): void {
    this.dimensions.clear();
  }

  /** Number of currently-stored dimensions. */
  size(): number {
    return this.dimensions.size;
  }

  private warn(message: string): void {
    try {
      this.console?.warn(`[monitor] CustomDimensions: ${message}`);
    } catch {
      // never let logging break the caller
    }
  }
}
