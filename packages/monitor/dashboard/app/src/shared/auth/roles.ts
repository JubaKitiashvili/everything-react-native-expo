import type { AuthRole } from '@/shared/api/client';

/** Privilege rank — higher satisfies lower. Mirrors the server's ROLE_RANK. */
const RANK: Record<AuthRole, number> = { owner: 3, member: 2, viewer: 1 };

/** Does `actual` meet the `required` minimum role? */
export function roleSatisfies(actual: AuthRole, required: AuthRole): boolean {
  return RANK[actual] >= RANK[required];
}

/** Human label for a role, for chips/menus. */
export function roleLabel(role: AuthRole): string {
  switch (role) {
    case 'owner':
      return 'Owner';
    case 'member':
      return 'Member';
    case 'viewer':
      return 'Viewer';
  }
}
