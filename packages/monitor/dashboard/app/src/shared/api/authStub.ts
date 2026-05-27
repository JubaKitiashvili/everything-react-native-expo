import type { DashboardApiClient } from './client';

/**
 * Test helper: default stubs for the Task 117.18 RBAC auth methods so the
 * many component-test mock clients that don't exercise auth can spread these
 * in without restating all six. Only imported from `*.test.tsx`, so it is
 * tree-shaken out of the production bundle. `fetchMe` reports the login-free
 * (dormant) mode by default — the shape component tests render under.
 */
export function authStubMethods(): Pick<
  DashboardApiClient,
  'login' | 'fetchMe' | 'registerUser' | 'fetchUsers' | 'setUserRole' | 'deleteUser'
> {
  return {
    login: async () => {
      throw new Error('not used');
    },
    fetchMe: async () => ({
      enforcing: false,
      user: { id: 'system', email: 'system@localhost', role: 'owner', tenantId: 'default' },
    }),
    registerUser: async () => {
      throw new Error('not used');
    },
    fetchUsers: async () => [],
    setUserRole: async () => undefined,
    deleteUser: async () => undefined,
  };
}
