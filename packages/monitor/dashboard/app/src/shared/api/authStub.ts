import type { DashboardApiClient } from './client';

/**
 * Test helper: default stubs for client methods most component-test mocks
 * don't exercise — the Task 117.18 RBAC auth methods and the Task 117.20
 * bug-report reply methods — so those mocks can spread these in instead of
 * restating each. Only imported from `*.test.tsx`, so it is tree-shaken out
 * of the production bundle. `fetchMe` reports the login-free (dormant) mode
 * by default — the shape component tests render under.
 */
export function authStubMethods(): Pick<
  DashboardApiClient,
  | 'login'
  | 'fetchMe'
  | 'registerUser'
  | 'fetchUsers'
  | 'setUserRole'
  | 'deleteUser'
  | 'fetchBugReportReplies'
  | 'addBugReportReply'
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
    fetchBugReportReplies: async () => [],
    addBugReportReply: async () => {
      throw new Error('not used');
    },
  };
}
