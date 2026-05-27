// Test-only helpers: build mocked deps and signed webhook bodies.
// Imported by *.test.ts files; excluded from the published build.

import { createHmac } from 'node:crypto';
import { vi } from 'vitest';
import type { GitHubClient, HandlerDeps, MonitorClient } from './types.js';

export interface MockDeps extends HandlerDeps {
  github: GitHubClient & {
    createCommitStatus: ReturnType<typeof vi.fn>;
    createIssueComment: ReturnType<typeof vi.fn>;
  };
  monitor: MonitorClient & {
    recordDeployMarker: ReturnType<typeof vi.fn>;
    getCrashFreeRate: ReturnType<typeof vi.fn>;
    linkIssueToCrash: ReturnType<typeof vi.fn>;
  };
}

/** Build a HandlerDeps where every method is a vi.fn() with sensible defaults. */
export function makeMockDeps(overrides?: {
  crashFreeRate?: (version: string) => number | null;
}): MockDeps {
  const github = {
    createCommitStatus: vi.fn(async () => undefined),
    createIssueComment: vi.fn(async () => undefined),
  };

  const monitor = {
    recordDeployMarker: vi.fn(async () => undefined),
    getCrashFreeRate: vi.fn(async ({ version }: { version: string }) =>
      overrides?.crashFreeRate ? overrides.crashFreeRate(version) : null,
    ),
    linkIssueToCrash: vi.fn(async () => undefined),
  };

  return { github, monitor } as MockDeps;
}

/** Sign a raw body exactly the way GitHub does. */
export function signBody(rawBody: string, secret: string): string {
  return 'sha256=' + createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex');
}
