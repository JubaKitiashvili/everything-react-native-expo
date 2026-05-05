// Task 117.91 — symbolication accuracy fixture.
//
// 50-frame stack with three categories — Hermes JS, ProGuard Android,
// dSYM iOS — and a known mapping. Subjects implement
// `measureSymbolicationAccuracy` by running their resolver against
// these frames; the harness scores them against `expectedFile +
// expectedLine`.
//
// The fixture is intentionally compact + readable: real production
// fixtures should layer on top of this with real bytecode + machO
// blobs, but those don't fit a unit-testable harness. The point is
// the methodology, not absolute frame counts.

export interface FixtureFrame {
  category: 'hermes' | 'proguard' | 'dsym';
  /** What the subject's resolver receives. */
  raw: string;
  /** Ground-truth file the resolver should return. */
  expectedFile: string;
  /** Ground-truth line. */
  expectedLine: number;
}

export interface FixtureMappingEntry {
  raw: string;
  file: string;
  line: number;
}

export interface FixtureMapping {
  hermes: FixtureMappingEntry[];
  proguard: FixtureMappingEntry[];
  dsym: FixtureMappingEntry[];
}

/** Expand a small seed to 50 frames so the accuracy score has enough resolution. */
export const fixtureFrames: FixtureFrame[] = expandFrames();

export const fixtureMapping: FixtureMapping = {
  hermes: [
    { raw: '0xa1', file: 'src/screens/Home.tsx', line: 42 },
    { raw: '0xa2', file: 'src/screens/Home.tsx', line: 88 },
    { raw: '0xa3', file: 'src/api/client.ts', line: 17 },
    { raw: '0xa4', file: 'src/store/auth.ts', line: 105 },
    { raw: '0xa5', file: 'src/components/Card.tsx', line: 23 },
  ],
  proguard: [
    { raw: 'a.b.c.d:42', file: 'com/example/HomeActivity.java', line: 42 },
    { raw: 'a.b.c.e:88', file: 'com/example/MainPresenter.java', line: 88 },
    { raw: 'a.b.c.f:17', file: 'com/example/api/Client.java', line: 17 },
    { raw: 'a.b.c.g:105', file: 'com/example/store/Auth.java', line: 105 },
    { raw: 'a.b.c.h:23', file: 'com/example/ui/Card.java', line: 23 },
  ],
  dsym: [
    { raw: '0x100012340', file: 'HomeViewController.swift', line: 42 },
    { raw: '0x100012380', file: 'HomeViewController.swift', line: 88 },
    { raw: '0x1000123c0', file: 'APIClient.swift', line: 17 },
    { raw: '0x100012400', file: 'AuthStore.swift', line: 105 },
    { raw: '0x100012440', file: 'CardView.swift', line: 23 },
  ],
};

function expandFrames(): FixtureFrame[] {
  const seed: FixtureFrame[] = [
    { category: 'hermes', raw: '0xa1', expectedFile: 'src/screens/Home.tsx', expectedLine: 42 },
    { category: 'hermes', raw: '0xa2', expectedFile: 'src/screens/Home.tsx', expectedLine: 88 },
    { category: 'hermes', raw: '0xa3', expectedFile: 'src/api/client.ts', expectedLine: 17 },
    { category: 'hermes', raw: '0xa4', expectedFile: 'src/store/auth.ts', expectedLine: 105 },
    { category: 'hermes', raw: '0xa5', expectedFile: 'src/components/Card.tsx', expectedLine: 23 },
    { category: 'proguard', raw: 'a.b.c.d:42', expectedFile: 'com/example/HomeActivity.java', expectedLine: 42 },
    { category: 'proguard', raw: 'a.b.c.e:88', expectedFile: 'com/example/MainPresenter.java', expectedLine: 88 },
    { category: 'proguard', raw: 'a.b.c.f:17', expectedFile: 'com/example/api/Client.java', expectedLine: 17 },
    { category: 'proguard', raw: 'a.b.c.g:105', expectedFile: 'com/example/store/Auth.java', expectedLine: 105 },
    { category: 'proguard', raw: 'a.b.c.h:23', expectedFile: 'com/example/ui/Card.java', expectedLine: 23 },
    { category: 'dsym', raw: '0x100012340', expectedFile: 'HomeViewController.swift', expectedLine: 42 },
    { category: 'dsym', raw: '0x100012380', expectedFile: 'HomeViewController.swift', expectedLine: 88 },
    { category: 'dsym', raw: '0x1000123c0', expectedFile: 'APIClient.swift', expectedLine: 17 },
    { category: 'dsym', raw: '0x100012400', expectedFile: 'AuthStore.swift', expectedLine: 105 },
    { category: 'dsym', raw: '0x100012440', expectedFile: 'CardView.swift', expectedLine: 23 },
  ];
  // Repeat to 50 frames keeping category proportions.
  const out: FixtureFrame[] = [];
  while (out.length < 50) {
    for (const f of seed) {
      if (out.length >= 50) break;
      out.push(f);
    }
  }
  return out;
}

/**
 * Reference resolver — given a fixture frame and the fixture mapping,
 * returns what the subject's resolver SHOULD produce. Subjects with a
 * native resolver compare against this; subjects with a placeholder
 * adapter return null entirely.
 */
export function applyFixtureMapping(
  frame: FixtureFrame,
  mapping: FixtureMapping,
): { file: string | null; line: number | null } {
  const entries = mapping[frame.category] ?? [];
  const hit = entries.find((e) => e.raw === frame.raw);
  return hit ? { file: hit.file, line: hit.line } : { file: null, line: null };
}
