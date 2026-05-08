// Task 117.23 — Frustration panel barrel.

export { Frustration } from './Frustration';
export type { FrustrationProps } from './Frustration';
export { UserImpactCard } from './UserImpactCard';
export type { UserImpactCardProps } from './UserImpactCard';
export { PerButtonTable } from './PerButtonTable';
export type { PerButtonTableProps } from './PerButtonTable';
export { DeadZonesList } from './DeadZonesList';
export type { DeadZonesListProps } from './DeadZonesList';
export {
  aggregateByComponent,
  countSessions,
  countTapsByComponent,
  extractFrustrations,
  pickHeadline,
} from './aggregate';
export type {
  ComponentImpact,
  FrustrationHeadline,
  FrustrationInstance,
  FrustrationSignal,
} from './aggregate';
