// Task 117.6 — orchestrator tests. Every collaborator (dashboard,
// LLM, GitHub, confidence) is a stub; we never hit the network.

import { describe, expect, test, vi } from 'vitest';
import { AIFixPR } from './AIFixPR.js';
import {
  ConfidenceStore,
  InMemoryConfidenceStorage,
} from './confidence.js';
import type { CrashGroupRecord, EventRecord } from '@erne/monitor-mcp/client';
import type { GitHubAdapter, OpenPRInput, OpenPRResult } from './github.js';
import type { LLM, FixCandidate } from './llm.js';

const NOW = 1_770_000_000_000;

const baseGroup: CrashGroupRecord = {
  fingerprint: 'fp-abcdef01',
  message: 'TypeError',
  firstSeen: NOW - 1000,
  lastSeen: NOW,
  eventCount: 1,
  sessionCount: 1,
  status: 'new',
};

const baseEvent: EventRecord = {
  id: 'evt-1',
  type: 'crash',
  severity: 'critical',
  sessionId: 's1',
  fingerprint: 'fp-abcdef01',
  timestamp: NOW,
  receivedAt: NOW,
  payload: {
    message: 'TypeError: undefined is not an object',
    stack: [{ symbol: 'foo', file: 'src/x.ts', line: 1, column: 1 }],
  },
};

function makeStubs(opts: {
  candidate?: FixCandidate;
  contextMissing?: boolean;
  prResult?: OpenPRResult;
  capturedPR?: { value: OpenPRInput | null };
}) {
  const auditCalls: Array<Record<string, unknown>> = [];
  const dashboardClient = {
    listCrashGroups: async () => (opts.contextMissing ? [] : [baseGroup]),
    listEvents: async () => [baseEvent],
    recordAiAction: async (record: Record<string, unknown>) => {
      auditCalls.push(record);
      return { inserted: true, record };
    },
  } as never;
  // Expose on the returned bag so tests can assert on emitted audit
  // rows after `propose()` resolves.
  (dashboardClient as unknown as { __auditCalls: Array<Record<string, unknown>> }).__auditCalls =
    auditCalls;

  const candidate: FixCandidate = opts.candidate ?? {
    title: 'Fix it',
    summary: 'Diagnosis',
    files: [
      { path: 'src/x.ts', mode: 'replace', content: 'export const x = 1;\n' },
    ],
    confidence: 90,
    classification: 'null-check',
    abstain: false,
  };
  const llm: LLM = {
    generateFix: async () => candidate,
  };

  const github = {
    owner: 'o',
    repo: 'r',
    defaultBranch: 'main',
    openPR: vi.fn(async (input: OpenPRInput) => {
      if (opts.capturedPR) opts.capturedPR.value = input;
      return (
        opts.prResult ?? {
          url: 'https://github.com/o/r/pull/123',
          number: 123,
          sha: 'deadbeef',
        }
      );
    }),
  } as unknown as GitHubAdapter;

  const confidence = new ConfidenceStore({
    storage: new InMemoryConfidenceStorage(),
    now: () => NOW,
  });

  return { dashboardClient, llm, github, confidence };
}

function makeOrchestrator(stubs: ReturnType<typeof makeStubs>, overrides: Partial<ConstructorParameters<typeof AIFixPR>[0]> = {}) {
  return new AIFixPR({
    dashboardClient: stubs.dashboardClient,
    llm: stubs.llm,
    github: stubs.github,
    confidence: stubs.confidence,
    dashboardUrl: 'https://dash.example.com',
    now: () => NOW,
    ...overrides,
  });
}

describe('AIFixPR.propose — happy path', () => {
  test('opens a PR and bumps the proposal counter', async () => {
    const captured = { value: null as OpenPRInput | null };
    const stubs = makeStubs({ capturedPR: captured });
    const orchestrator = makeOrchestrator(stubs);

    // Pre-train the bucket so trust > 0.5 and effective ≥ 50.
    await stubs.confidence.recordOutcome('null-check', 'merged');
    await stubs.confidence.recordOutcome('null-check', 'merged');

    const result = await orchestrator.propose('fp-abcdef01');
    expect(result.status).toBe('proposed');
    if (result.status === 'proposed') {
      expect(result.pr.number).toBe(123);
      expect(result.candidate.classification).toBe('null-check');
      expect(result.effectiveConfidence).toBeGreaterThanOrEqual(50);
    }
    expect(stubs.github.openPR).toHaveBeenCalledOnce();
    // Confidence bucket got a proposal increment.
    expect(stubs.confidence.bucket('null-check').proposed).toBe(1);

    // Branch name encodes short fingerprint + timestamp.
    expect(captured.value?.branch).toMatch(/^erne\/fix\/fp-abcde-/);
    // Body backlinks to the dashboard.
    expect(captured.value?.body).toContain(
      'https://dash.example.com/crashes/fp-abcdef01',
    );
  });
});

describe('AIFixPR.propose — skip paths', () => {
  test('returns context-not-found when the fingerprint has no group', async () => {
    const stubs = makeStubs({ contextMissing: true });
    const result = await makeOrchestrator(stubs).propose('fp-missing');
    expect(result).toMatchObject({ status: 'skipped', reason: 'context-not-found' });
  });

  test('returns llm-abstain when the model abstains', async () => {
    const stubs = makeStubs({
      candidate: {
        title: '',
        summary: '',
        files: [],
        confidence: 0,
        classification: 'unknown',
        abstain: true,
        abstainReason: 'no source file',
      },
    });
    const result = await makeOrchestrator(stubs).propose('fp-abcdef01');
    expect(result.status).toBe('skipped');
    if (result.status === 'skipped') expect(result.reason).toBe('llm-abstain');
  });

  test('returns no-files when the candidate has zero edits', async () => {
    const stubs = makeStubs({
      candidate: {
        title: 't',
        summary: 's',
        files: [],
        confidence: 90,
        classification: 'null-check',
        abstain: false,
      },
    });
    const result = await makeOrchestrator(stubs).propose('fp-abcdef01');
    expect(result.status).toBe('skipped');
    if (result.status === 'skipped') expect(result.reason).toBe('no-files');
  });

  test('returns too-many-files past the cap', async () => {
    const stubs = makeStubs({
      candidate: {
        title: 't',
        summary: 's',
        files: Array.from({ length: 8 }, (_, i) => ({
          path: `f${i}.ts`,
          mode: 'replace' as const,
          content: '',
        })),
        confidence: 90,
        classification: 'null-check',
        abstain: false,
      },
    });
    const result = await makeOrchestrator(stubs, { maxFiles: 5 }).propose('fp-abcdef01');
    expect(result.status).toBe('skipped');
    if (result.status === 'skipped') expect(result.reason).toBe('too-many-files');
  });

  test('returns unsupported-mode for patch-mode edits', async () => {
    const stubs = makeStubs({
      candidate: {
        title: 't',
        summary: 's',
        files: [{ path: 'f.ts', mode: 'patch', content: '@@ -1 +1 @@' }],
        confidence: 90,
        classification: 'null-check',
        abstain: false,
      },
    });
    const result = await makeOrchestrator(stubs).propose('fp-abcdef01');
    expect(result.status).toBe('skipped');
    if (result.status === 'skipped') expect(result.reason).toBe('unsupported-mode');
  });

  test('returns confidence-too-low when effective < minConfidence', async () => {
    // Empty bucket → trust 0.5 → 80 × 0.5 = 40 < 50.
    const stubs = makeStubs({
      candidate: {
        title: 't',
        summary: 's',
        files: [{ path: 'f.ts', mode: 'replace', content: '' }],
        confidence: 80,
        classification: 'fresh-class',
        abstain: false,
      },
    });
    const result = await makeOrchestrator(stubs).propose('fp-abcdef01');
    expect(result.status).toBe('skipped');
    if (result.status === 'skipped') {
      expect(result.reason).toBe('confidence-too-low');
      expect(result.effectiveConfidence).toBeLessThan(50);
    }
  });
});

describe('AIFixPR — audit follow-up gates', () => {
  test('rejects path-traversal candidates with invalid-paths', async () => {
    const stubs = makeStubs({
      candidate: {
        title: 't',
        summary: 's',
        files: [{ path: 'src/../../etc/passwd', mode: 'replace', content: 'x' }],
        confidence: 95,
        classification: 'null-check',
        abstain: false,
      },
    });
    const result = await makeOrchestrator(stubs).propose('fp-abcdef01');
    expect(result.status).toBe('skipped');
    if (result.status === 'skipped') {
      expect(result.reason).toBe('invalid-paths');
      expect(result.validationFailures?.[0]?.code).toBe('parent-traversal');
    }
  });

  test('rejects denied-path candidates (workflow rewrite attempt)', async () => {
    const stubs = makeStubs({
      candidate: {
        title: 't',
        summary: 's',
        files: [
          { path: '.github/workflows/release.yml', mode: 'replace', content: '' },
        ],
        confidence: 95,
        classification: 'null-check',
        abstain: false,
      },
    });
    const result = await makeOrchestrator(stubs).propose('fp-abcdef01');
    expect(result.status).toBe('skipped');
    if (result.status === 'skipped') {
      expect(result.reason).toBe('invalid-paths');
      expect(result.validationFailures?.[0]?.code).toBe('denied-path');
    }
  });

  test('rejects oversize candidates with invalid-paths', async () => {
    const stubs = makeStubs({
      candidate: {
        title: 't',
        summary: 's',
        files: [
          { path: 'src/big.ts', mode: 'replace', content: 'x'.repeat(300_000) },
        ],
        confidence: 95,
        classification: 'null-check',
        abstain: false,
      },
    });
    await stubs.confidence.recordOutcome('null-check', 'merged');
    await stubs.confidence.recordOutcome('null-check', 'merged');
    const result = await makeOrchestrator(stubs).propose('fp-abcdef01');
    expect(result.status).toBe('skipped');
    if (result.status === 'skipped') {
      expect(result.reason).toBe('invalid-paths');
      expect(result.validationFailures?.[0]?.code).toBe('file-too-large');
    }
  });

  test('exposes repoOwner / repoName via the github adapter (no redundant prop)', async () => {
    const stubs = makeStubs({});
    const o = makeOrchestrator(stubs);
    expect(o.repoOwner).toBe('o');
    expect(o.repoName).toBe('r');
  });
});

describe('AIFixPR — branch name', () => {
  test('truncates fingerprint to 8 chars, sanitises non-alphanum', async () => {
    const captured = { value: null as OpenPRInput | null };
    // Need a representative event whose fingerprint matches the
    // synthetic crash group below — use the same alt fingerprint
    // throughout so buildFixContext finds it.
    const altFp = 'fp/abc def!01';
    const stubs = makeStubs({ capturedPR: captured });
    // Override dashboardClient to surface this fingerprint.
    stubs.dashboardClient = {
      listCrashGroups: async () => [
        { ...baseGroup, fingerprint: altFp },
      ],
      listEvents: async () => [{ ...baseEvent, fingerprint: altFp }],
      recordAiAction: async () => ({ inserted: true, record: {} }),
    } as never;
    // Pre-train confidence so the proposal isn't gated out.
    await stubs.confidence.recordOutcome('null-check', 'merged');
    await stubs.confidence.recordOutcome('null-check', 'merged');
    const orchestrator = makeOrchestrator(stubs);
    await orchestrator.propose(altFp);
    expect(captured.value?.branch).toMatch(/^erne\/fix\/fp-abc-d-/);
  });
});

describe('AIFixPR — audit emission (Task 117.81)', () => {
  function readAudit(stubs: ReturnType<typeof makeStubs>): Array<Record<string, unknown>> {
    return (
      (
        stubs.dashboardClient as unknown as {
          __auditCalls: Array<Record<string, unknown>>;
        }
      ).__auditCalls ?? []
    );
  }

  test('emits one audit row per propose() — proposed path captures pr + files', async () => {
    const stubs = makeStubs({});
    await stubs.confidence.recordOutcome('null-check', 'merged');
    await stubs.confidence.recordOutcome('null-check', 'merged');
    const orchestrator = makeOrchestrator(stubs);
    await orchestrator.propose('fp-abcdef01');
    const rows = readAudit(stubs);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      agent: 'ai-fix-pr',
      action: 'propose-fix',
      fingerprint: 'fp-abcdef01',
      outcome: 'proposed',
      classification: 'null-check',
      prUrl: 'https://github.com/o/r/pull/123',
    });
    expect(rows[0]?.filesConsidered).toEqual(['src/x.ts']);
    expect(rows[0]?.toolsCalled).toEqual([
      'list_crash_groups',
      'list_events',
      'open_pr',
    ]);
  });

  test('skipped path encodes reason in outcome + metadata', async () => {
    const stubs = makeStubs({
      candidate: {
        title: 't',
        summary: 's',
        files: [{ path: 'f.ts', mode: 'replace', content: '' }],
        confidence: 80,
        classification: 'fresh',
        abstain: false,
      },
    });
    const orchestrator = makeOrchestrator(stubs);
    const result = await orchestrator.propose('fp-abcdef01');
    expect(result.status).toBe('skipped');
    const rows = readAudit(stubs);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.outcome).toBe('skipped:confidence-too-low');
    expect((rows[0]?.metadata as { reason: string }).reason).toBe('confidence-too-low');
  });

  test('audit failure does not break propose()', async () => {
    const stubs = makeStubs({});
    await stubs.confidence.recordOutcome('null-check', 'merged');
    await stubs.confidence.recordOutcome('null-check', 'merged');
    // Patch the dashboard stub to throw on audit writes.
    (stubs.dashboardClient as never as {
      recordAiAction: (r: unknown) => Promise<unknown>;
    }).recordAiAction = async () => {
      throw new Error('audit down');
    };
    const orchestrator = makeOrchestrator(stubs);
    const result = await orchestrator.propose('fp-abcdef01');
    // PR still got opened — audit is best-effort.
    expect(result.status).toBe('proposed');
  });
});
