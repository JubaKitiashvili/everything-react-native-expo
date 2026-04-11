import type { Collector, MonitorConfig, MonitorEvent } from '../types';
import type { SignalBus } from '../core/SignalBus';
import type { EventStore } from '../storage/EventStore';
import type { SessionManager } from '../core/SessionManager';

export interface NetworkEventData {
  url: string;
  method: string;
  statusCode: number | null;
  durationMs: number;
  requestSize: number | null;
  responseSize: number | null;
  transport: 'fetch' | 'xhr';
  errorMessage?: string;
}

export interface NetworkCollectorDeps {
  signalBus: SignalBus;
  eventStore: EventStore;
  sessionManager: SessionManager;
  /**
   * The object on which to install the fetch/XHR patches. Defaults to
   * `globalThis`; tests can inject a sandbox.
   */
  target?: {
    fetch?: typeof fetch;
    XMLHttpRequest?: typeof XMLHttpRequest;
  };
  /**
   * URLs whose hostname matches any of these substrings are ignored
   * (transport endpoints, Metro dev server, etc.). Case-insensitive.
   */
  ignoreHosts?: readonly string[];
  /** Monotonic clock; defaults to performance.now / Date.now. */
  now?: () => number;
  wallNow?: () => number;
}

const DEFAULT_IGNORE_HOSTS: readonly string[] = [
  'localhost:8081', // Metro bundler
  '127.0.0.1:8081',
  'symbolicate', // RN symbolication endpoint
  'inspector', // Hermes inspector
];

function isIgnored(url: string, ignoreHosts: readonly string[]): boolean {
  const lower = url.toLowerCase();
  for (const needle of ignoreHosts) {
    if (lower.includes(needle.toLowerCase())) return true;
  }
  return false;
}

function sizeOfBody(body: unknown): number | null {
  if (body == null) return 0;
  if (typeof body === 'string') return body.length;
  if (body instanceof ArrayBuffer) return body.byteLength;
  if (ArrayBuffer.isView(body)) {
    return (body as ArrayBufferView).byteLength;
  }
  if (typeof Blob !== 'undefined' && body instanceof Blob) return body.size;
  if (
    typeof FormData !== 'undefined' &&
    body instanceof FormData
  ) {
    return null; // cannot measure without iterating
  }
  return null;
}

function extractUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.toString();
  if (typeof Request !== 'undefined' && input instanceof Request) {
    return input.url;
  }
  return String(input);
}

function extractMethod(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
): string {
  if (init?.method) return init.method.toUpperCase();
  if (typeof Request !== 'undefined' && input instanceof Request) {
    return input.method.toUpperCase();
  }
  return 'GET';
}

/**
 * NetworkCollector intercepts outbound HTTP traffic via transparent
 * monkey-patches. It never alters request or response behavior — it only
 * observes timing, sizes, and status codes for monitoring.
 */
export class NetworkCollector implements Collector {
  readonly name = 'network';
  readonly priority = 10;

  private readonly deps: NetworkCollectorDeps;
  private readonly ignoreHosts: readonly string[];
  private readonly now: () => number;
  private readonly wallNow: () => number;
  private readonly target: {
    fetch?: typeof fetch;
    XMLHttpRequest?: typeof XMLHttpRequest;
  };

  private originalFetch: typeof fetch | undefined;
  private originalXHR: typeof XMLHttpRequest | undefined;
  private running = false;

  constructor(deps: NetworkCollectorDeps) {
    this.deps = deps;
    this.target = deps.target ?? (globalThis as never);
    this.ignoreHosts = deps.ignoreHosts ?? DEFAULT_IGNORE_HOSTS;
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
  init(_config: MonitorConfig): void {
    // nothing yet — sampling and consent are Phase 1b
  }

  start(): void {
    if (this.running) return;
    this.patchFetch();
    this.patchXHR();
    this.running = true;
  }

  stop(): void {
    if (!this.running) return;
    if (this.originalFetch) {
      this.target.fetch = this.originalFetch;
      this.originalFetch = undefined;
    }
    if (this.originalXHR) {
      this.target.XMLHttpRequest = this.originalXHR;
      this.originalXHR = undefined;
    }
    this.running = false;
  }

  dispose(): void {
    this.stop();
  }

  isRunning(): boolean {
    return this.running;
  }

  private patchFetch(): void {
    const original = this.target.fetch;
    if (typeof original !== 'function') return;
    this.originalFetch = original;
    const collector = this;
    const patched: typeof fetch = function (
      this: unknown,
      input: RequestInfo | URL,
      init?: RequestInit,
    ) {
      const start = collector.now();
      const url = extractUrl(input);
      const method = extractMethod(input, init);
      const requestSize = sizeOfBody(init?.body ?? null);
      const promise = original.call(this as never, input as never, init);
      promise.then(
        (response: Response) => {
          collector.record({
            url,
            method,
            statusCode: response.status,
            durationMs: collector.now() - start,
            requestSize,
            responseSize:
              Number(response.headers.get('content-length')) || null,
            transport: 'fetch',
          });
        },
        (err: unknown) => {
          collector.record({
            url,
            method,
            statusCode: null,
            durationMs: collector.now() - start,
            requestSize,
            responseSize: null,
            transport: 'fetch',
            errorMessage:
              err instanceof Error ? err.message : String(err),
          });
        },
      );
      return promise;
    };
    this.target.fetch = patched as typeof fetch;
  }

  private patchXHR(): void {
    const Original = this.target.XMLHttpRequest;
    if (typeof Original !== 'function') return;
    this.originalXHR = Original;
    const collector = this;

    class PatchedXHR extends Original {
      private __monitorUrl: string = '';
      private __monitorMethod: string = 'GET';
      private __monitorStart: number = 0;
      private __monitorReqSize: number | null = 0;

      open(method: string, url: string, ...rest: unknown[]): void {
        this.__monitorMethod = method.toUpperCase();
        this.__monitorUrl = url;
        // @ts-expect-error passthrough to original overloaded signature
        return super.open(method, url, ...rest);
      }

      send(body?: Document | XMLHttpRequestBodyInit | null): void {
        this.__monitorStart = collector.now();
        this.__monitorReqSize = sizeOfBody(body ?? null);
        this.addEventListener('loadend', () => {
          collector.record({
            url: this.__monitorUrl,
            method: this.__monitorMethod,
            statusCode: this.status || null,
            durationMs: collector.now() - this.__monitorStart,
            requestSize: this.__monitorReqSize,
            responseSize: collector.safeResponseSize(this),
            transport: 'xhr',
            errorMessage: this.status === 0 ? 'network error' : undefined,
          });
        });
        return super.send(body ?? null);
      }
    }

    this.target.XMLHttpRequest = PatchedXHR as typeof XMLHttpRequest;
  }

  /**
   * Reads a response body size without assuming the response type. Touching
   * `xhr.responseText` when responseType is 'blob' / 'arraybuffer' / 'json'
   * throws InvalidStateError, so we probe defensively.
   */
  safeResponseSize(xhr: XMLHttpRequest): number | null {
    try {
      const contentLength = Number(
        xhr.getResponseHeader?.('content-length') ?? '',
      );
      if (Number.isFinite(contentLength) && contentLength > 0) {
        return contentLength;
      }
    } catch {
      // ignore — headers may not be readable
    }
    try {
      const type = xhr.responseType;
      if (type === '' || type === 'text') {
        const text = xhr.responseText;
        return typeof text === 'string' ? text.length : null;
      }
      if (type === 'arraybuffer') {
        const buf = xhr.response as ArrayBuffer | null;
        return buf?.byteLength ?? null;
      }
      if (type === 'blob') {
        const blob = xhr.response as Blob | null;
        return blob?.size ?? null;
      }
    } catch {
      // Hermes / RN can throw on responseText/response access in some
      // states; treat as "unknown size".
    }
    return null;
  }

  private record(data: NetworkEventData): void {
    if (isIgnored(data.url, this.ignoreHosts)) return;
    const event: MonitorEvent = {
      type: 'network',
      timestamp: this.now(),
      wallTime: this.wallNow(),
      sessionId: this.deps.sessionManager.getCurrentSessionId(),
      data,
    };
    this.deps.signalBus.emit(event);
    void this.deps.eventStore.insert(event, 'normal').catch(() => {
      // swallow — bus already got it
    });
  }
}
