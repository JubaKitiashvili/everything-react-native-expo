import { useEffect, useRef } from 'react';
import type { RealtimeFrame } from '@/shared/realtime';
import { useRealtimeContext, type FrameHandler } from './RealtimeContext';

export type FrameKind = RealtimeFrame['kind'];

export interface UseRealtimeChannelOptions {
  /** Only invoke the handler for these frame kinds. Omit = every kind. */
  kinds?: FrameKind[];
  /** Skip subscribing entirely when false. */
  enabled?: boolean;
}

/**
 * Subscribe a page/component to the shared realtime socket. The handler
 * fires for every matching frame and the subscription is torn down on
 * unmount — so navigating away from a page never leaks a listener.
 *
 * The latest `handler` is always invoked without re-subscribing (a ref
 * holds it), so passing an inline arrow function causes no churn.
 */
export function useRealtimeChannel(
  handler: FrameHandler,
  options: UseRealtimeChannelOptions = {},
): void {
  const { subscribe } = useRealtimeContext();
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  const { enabled = true } = options;
  // Stable primitive key so the effect only re-subscribes when the kinds
  // set actually changes — not on every render.
  const kindsKey = options.kinds ? [...options.kinds].sort().join(',') : '';

  useEffect(() => {
    if (!enabled) return;
    const kinds = kindsKey ? (kindsKey.split(',') as FrameKind[]) : null;
    const wrapped: FrameHandler = (frame) => {
      if (kinds && !kinds.includes(frame.kind)) return;
      handlerRef.current(frame);
    };
    return subscribe(wrapped);
  }, [subscribe, kindsKey, enabled]);
}
