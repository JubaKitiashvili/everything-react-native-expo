import type { ReactNode } from 'react';
import type { AuthRole } from '@/shared/api/client';
import { useAuth } from './useAuth';
import { roleSatisfies } from './roles';

export interface RequireRoleProps {
  /** Minimum role required to render `children`. */
  role: AuthRole;
  children: ReactNode;
  /** Rendered when the current user lacks the role. Default: nothing. */
  fallback?: ReactNode;
}

/**
 * Conditionally renders `children` only when the current user satisfies
 * `role`. While RBAC is dormant the user is the synthetic Owner, so every
 * gate passes — checks only hide UI for a real lower-privilege user.
 */
export function RequireRole({ role, children, fallback = null }: RequireRoleProps) {
  const { user } = useAuth();
  if (user && roleSatisfies(user.role, role)) return <>{children}</>;
  return <>{fallback}</>;
}
