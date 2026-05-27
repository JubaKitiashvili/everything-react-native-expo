/**
 * `@erne/monitor/discovery` — mDNS/Bonjour LAN auto-discovery (Task 117.79).
 * Opt-in: a device finds the dashboard on the local network without an IP.
 * Wire a native zeroconf module as the `MdnsBrowser`; this layer resolves
 * discovered services into dashboard URLs. Kept on its own subpath so apps
 * that don't use it pay no bundle cost.
 */

export { DashboardDiscovery, ERNE_SERVICE_TYPE } from '../discovery/DashboardDiscovery';
export type {
  DashboardDiscoveryOptions,
  DiscoveredDashboard,
  DiscoveredService,
  MdnsBrowser,
  MdnsBrowserHandlers,
} from '../discovery/DashboardDiscovery';
