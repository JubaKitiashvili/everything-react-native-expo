import type { MonitorEvent } from '../types';
import type { Breadcrumb } from '../collectors/BreadcrumbCollector';
import type { CorrelationGroup } from './CorrelationEngine';

export interface SourceLocation {
  file?: string;
  line?: number;
  column?: number;
}

export interface BuiltContext {
  event: MonitorEvent;
  summary: string;
  breadcrumbs: Breadcrumb[];
  correlationGroup?: CorrelationGroup;
  sourceLocation?: SourceLocation;
  dedupCount: number;
  device?: Record<string, unknown>;
  app?: Record<string, unknown>;
  screen?: string | null;
}

export interface ContextBuilderDeps {
  /** Returns the last N breadcrumbs for crash reports. */
  getBreadcrumbs: (limit: number) => Breadcrumb[];
  /** Returns the current (top-of-stack) screen name. */
  getCurrentScreen?: () => string | null;
  /** Optional source-map resolver to enrich stack frames with file:line. */
  resolveSourceLocation?: (stack: string | null | undefined) => SourceLocation | undefined;
}

/**
 * ContextBuilder assembles the full context envelope for a signal —
 * breadcrumbs, source location, screen, correlation group, dedup
 * count, and a human-readable summary — ready for dispatch.
 */
export class ContextBuilder {
  private readonly deps: ContextBuilderDeps;
  /** Max breadcrumbs per context. Default 20. */
  private readonly breadcrumbLimit: number;

  constructor(deps: ContextBuilderDeps, breadcrumbLimit: number = 20) {
    this.deps = deps;
    this.breadcrumbLimit = breadcrumbLimit;
  }

  build(
    event: MonitorEvent,
    correlationGroup?: CorrelationGroup,
    dedupCount: number = 1,
  ): BuiltContext {
    const breadcrumbs = this.deps.getBreadcrumbs(this.breadcrumbLimit);
    const sourceLocation = this.resolveLocation(event);
    const screen = this.deps.getCurrentScreen?.() ?? null;
    return {
      event,
      summary: this.summarize(event, dedupCount),
      breadcrumbs,
      correlationGroup,
      sourceLocation,
      dedupCount,
      screen,
    };
  }

  private summarize(event: MonitorEvent, dedupCount: number): string {
    const prefix = dedupCount > 1 ? `(×${dedupCount}) ` : '';
    switch (event.type) {
      case 'crash': {
        const d = event.data as { message?: string; kind?: string; fingerprint?: string };
        return `${prefix}${(d.kind ?? 'exception').toUpperCase()}: ${d.message ?? 'unknown'}${d.fingerprint ? ' [' + d.fingerprint + ']' : ''}`;
      }
      case 'network': {
        const d = event.data as {
          method?: string;
          url?: string;
          statusCode?: number;
          errorMessage?: string;
        };
        return `${prefix}${d.method ?? '?'} ${d.url ?? ''} → ${d.statusCode ?? 'ERR'}${d.errorMessage ? ' (' + d.errorMessage + ')' : ''}`;
      }
      case 'navigation': {
        const d = event.data as { previousScreen?: string | null; screen?: string };
        return `${prefix}nav ${d.previousScreen ?? '∅'} → ${d.screen ?? '?'}`;
      }
      case 'render': {
        const d = event.data as {
          componentName?: string;
          renderCount?: number;
          isUnnecessary?: boolean;
        };
        return `${prefix}render ${d.componentName ?? '?'} × ${d.renderCount ?? 0}${d.isUnnecessary ? ' (unnecessary)' : ''}`;
      }
      case 'custom': {
        const d = event.data as { name?: string };
        return `${prefix}event ${d.name ?? 'unknown'}`;
      }
      default:
        return `${prefix}${event.type} event`;
    }
  }

  private resolveLocation(event: MonitorEvent): SourceLocation | undefined {
    if (!this.deps.resolveSourceLocation) return undefined;
    const stack = (event.data as { stack?: string | null }).stack;
    return this.deps.resolveSourceLocation(stack);
  }
}
