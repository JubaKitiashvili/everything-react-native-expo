// Task 117.6 audit follow-up — validator + redactor tests.

import { describe, expect, test } from 'vitest';
import {
  redactSecrets,
  safeFormatError,
  validateFileEdits,
} from './validate.js';
import type { FixFileEdit } from './llm.js';

function edit(path: string, content = 'x'): FixFileEdit {
  return { path, mode: 'replace', content };
}

describe('validateFileEdits — path safety', () => {
  test('passes a clean candidate', () => {
    expect(
      validateFileEdits([edit('src/Home.tsx', 'export const x = 1;\n')]),
    ).toEqual([]);
  });

  test('flags empty paths', () => {
    expect(validateFileEdits([edit('', 'x')])).toMatchObject([
      { code: 'empty-path' },
    ]);
  });

  test('flags POSIX absolute paths', () => {
    expect(validateFileEdits([edit('/etc/passwd', 'x')])).toMatchObject([
      { code: 'absolute-path' },
    ]);
  });

  test('flags Windows-style absolute paths', () => {
    expect(validateFileEdits([edit('C:\\windows\\system32\\foo.dll', 'x')])).toMatchObject([
      { code: 'absolute-path' },
    ]);
  });

  test('flags parent-traversal segments', () => {
    expect(validateFileEdits([edit('src/../../etc/passwd', 'x')])).toMatchObject([
      { code: 'parent-traversal' },
    ]);
  });

  test('flags backslash-style traversal too', () => {
    expect(validateFileEdits([edit('src\\..\\..\\etc\\passwd', 'x')])).toMatchObject([
      { code: 'parent-traversal' },
    ]);
  });

  test('flags GitHub workflow + dotfile + lockfile paths by default', () => {
    const cases = [
      '.github/workflows/release.yml',
      '.github/actions/ship/action.yml',
      '.npmrc',
      '.env',
      '.env.production',
      'package-lock.json',
      'pnpm-lock.yaml',
      'yarn.lock',
      '.git/config',
    ];
    for (const path of cases) {
      const failures = validateFileEdits([edit(path)]);
      expect(failures, path).toHaveLength(1);
      expect(failures[0]?.code, path).toBe('denied-path');
    }
  });

  test('honours additional repo-specific denied patterns', () => {
    const failures = validateFileEdits([edit('infra/terraform/main.tf')], {
      extraDeniedPatterns: [/^infra\//],
    });
    expect(failures).toMatchObject([{ code: 'denied-path' }]);
  });

  test('flags duplicate paths inside one candidate', () => {
    const failures = validateFileEdits([
      edit('src/foo.ts', 'a'),
      edit('src/foo.ts', 'b'),
    ]);
    expect(failures).toMatchObject([{ code: 'duplicate-path' }]);
  });
});

describe('validateFileEdits — size caps', () => {
  test('flags a single oversize file', () => {
    const big = 'x'.repeat(300_000);
    expect(
      validateFileEdits([edit('src/big.ts', big)], { maxFileBytes: 256_000 }),
    ).toMatchObject([{ code: 'file-too-large' }]);
  });

  test('flags an oversize aggregate even when no single file is too large', () => {
    const half = 'x'.repeat(200_000);
    const failures = validateFileEdits(
      [
        edit('a.ts', half),
        edit('b.ts', half),
        edit('c.ts', half),
      ],
      { maxFileBytes: 250_000, maxTotalBytes: 500_000 },
    );
    expect(failures).toMatchObject([{ code: 'total-too-large' }]);
  });
});

describe('redactSecrets', () => {
  test('redacts GitHub PATs (classic + fine-grained)', () => {
    expect(
      redactSecrets('token=ghp_abcdefghijklmnopqrstuvwx leaked'),
    ).toContain('ghp_***REDACTED***');
    expect(
      redactSecrets('token=github_pat_abcdef_abcdefghijklmnopqrstuvwxyz'),
    ).toContain('github_pat_***REDACTED***');
  });

  test('redacts Anthropic API keys', () => {
    // Real keys are ~108 chars; the regex requires ≥20 to avoid
    // chewing through unrelated `sk-ant-` substrings.
    expect(
      redactSecrets('sk-ant-api03-abcdefghijklmnopqrstuvwxyz1234567890'),
    ).toContain('sk-ant-***REDACTED***');
  });

  test('redacts Bearer headers without removing the prefix', () => {
    const out = redactSecrets('Authorization: Bearer ghp_abcdefghijklmnop');
    expect(out).toMatch(/Authorization:\s*Bearer\s+\*\*\*REDACTED\*\*\*/);
  });

  test('redacts URL-embedded x-access-tokens', () => {
    const out = redactSecrets(
      'cloning https://x-access-token:ghp_abcdefghij@github.com/o/r.git',
    );
    expect(out).toContain('x-access-token:***REDACTED***@');
    expect(out).not.toMatch(/ghp_[A-Za-z0-9]/);
  });

  test('leaves unrelated text untouched', () => {
    expect(redactSecrets('nothing to see here')).toBe('nothing to see here');
  });
});

describe('safeFormatError', () => {
  test('redacts tokens from Error.message + stack', () => {
    const err = new Error('failed: ghp_abcdefghijklmnopqrstuvwx');
    err.stack = 'Error: failed: ghp_abcdefghijklmnopqrstuvwx\n at line 1';
    const out = safeFormatError(err);
    expect(out).toContain('ghp_***REDACTED***');
    expect(out).not.toMatch(/ghp_[A-Za-z0-9]{6}/);
  });

  test('handles non-Error throws', () => {
    expect(
      safeFormatError({ token: 'sk-ant-abcdefghijklmnopqrstuvwxyz1234567890' }),
    ).toContain('sk-ant-***REDACTED***');
  });
});
