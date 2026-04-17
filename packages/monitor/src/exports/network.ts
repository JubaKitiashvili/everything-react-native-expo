/**
 * `@erne/monitor/network` — network instrumentation only. The
 * NetworkCollector monkey-patches `fetch` and `XMLHttpRequest` to surface
 * request timing, status codes, and error rates.
 */

export { NetworkCollector } from '../collectors/NetworkCollector';
