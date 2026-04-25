// Task 117.6 audit follow-up — fix-candidate validation + token
// redaction.
//
// The LLM produces an array of file edits that we apply to a real
// repository via the GitHub API. Without strict validation a confused
// or adversarial response could:
//
//   * write outside the repo via `..` segments
//   * rewrite security-sensitive files (`.github/workflows/*`,
//     `.git/*`, `.env*`, `.npmrc`, `package-lock.json` rewrite, etc.)
//   * land a payload large enough to fill GitHub's blob storage
//     budget for the run
//   * stash duplicate path entries that produce undefined Octokit
//     behaviour
//
// This module enforces all of the above before we open a PR. The
// orchestrator gates on the result and returns a structured skip
// reason — same shape as every other gate in `AIFixPR.propose`.

import type { FixFileEdit } from './llm.js';

export interface ValidatePathsOptions {
  /** Per-file content size limit in bytes. Default 256 KiB. */
  maxFileBytes?: number;
  /** Total candidate payload limit in bytes. Default 1 MiB. */
  maxTotalBytes?: number;
  /**
   * Additional path patterns (regexes) to deny on top of the bundled
   * defaults. Useful for repo-specific guards (e.g. `^infra/`).
   */
  extraDeniedPatterns?: RegExp[];
}

export type ValidationFailureCode =
  | 'empty-path'
  | 'absolute-path'
  | 'parent-traversal'
  | 'denied-path'
  | 'duplicate-path'
  | 'file-too-large'
  | 'total-too-large';

export interface ValidationFailure {
  code: ValidationFailureCode;
  /** Path that triggered the failure (or '' for total-size cases). */
  path: string;
  /** Detail string, e.g. "270000 > 262144" for size violations. */
  detail?: string;
}

/**
 * Built-in denylist of paths the agent must never write. Intentionally
 * conservative — these surfaces are either security-load-bearing
 * (CI / secrets), build artefacts (lockfiles), or git internals.
 */
const DEFAULT_DENIED_PATTERNS: readonly RegExp[] = Object.freeze([
  /^\.git\//,
  /^\.git$/,
  /^\.github\/workflows\//,
  /^\.github\/actions\//,
  /^\.npmrc$/,
  /^\.yarnrc(\.yml)?$/,
  /^\.env(\.|$)/,
  /^package-lock\.json$/,
  /^pnpm-lock\.yaml$/,
  /^yarn\.lock$/,
  /(^|\/)id_rsa$/,
  /(^|\/)id_ed25519$/,
  /\.pem$/,
  /\.p12$/,
  /\.keystore$/,
]);

const DEFAULT_MAX_FILE_BYTES = 256 * 1024;
const DEFAULT_MAX_TOTAL_BYTES = 1024 * 1024;

/**
 * Validate every file edit + the aggregate payload. Returns either an
 * empty array (everything passed) or a list of failures the caller
 * formats into a skip reason. Stops collecting at the first failure
 * per category — operators care that *some* file failed for *some*
 * reason; we don't need an exhaustive report.
 */
export function validateFileEdits(
  files: readonly FixFileEdit[],
  options: ValidatePathsOptions = {},
): ValidationFailure[] {
  const maxFile = options.maxFileBytes ?? DEFAULT_MAX_FILE_BYTES;
  const maxTotal = options.maxTotalBytes ?? DEFAULT_MAX_TOTAL_BYTES;
  const denied = [
    ...DEFAULT_DENIED_PATTERNS,
    ...(options.extraDeniedPatterns ?? []),
  ];

  const failures: ValidationFailure[] = [];
  const seen = new Set<string>();
  let totalBytes = 0;

  for (const edit of files) {
    const path = edit.path;
    if (!path || path.length === 0) {
      failures.push({ code: 'empty-path', path: '' });
      continue;
    }
    // Reject leading slashes (POSIX absolute) and Windows drive
    // letters (`C:\...`). GitHub doesn't accept either, but a clear
    // skip reason is friendlier than an opaque API error.
    if (path.startsWith('/') || /^[a-zA-Z]:[\\/]/.test(path)) {
      failures.push({ code: 'absolute-path', path });
      continue;
    }
    // Reject `..` anywhere in the path. We split on both separators
    // because LLMs sometimes emit Windows-style paths.
    const segments = path.split(/[\\/]+/);
    if (segments.some((s) => s === '..')) {
      failures.push({ code: 'parent-traversal', path });
      continue;
    }
    // Normalise to POSIX for the denylist check.
    const normalised = segments.join('/');
    const matched = denied.find((re) => re.test(normalised));
    if (matched) {
      failures.push({ code: 'denied-path', path, detail: matched.source });
      continue;
    }
    if (seen.has(normalised)) {
      failures.push({ code: 'duplicate-path', path });
      continue;
    }
    seen.add(normalised);

    const size = Buffer.byteLength(edit.content, 'utf8');
    if (size > maxFile) {
      failures.push({
        code: 'file-too-large',
        path,
        detail: `${size} > ${maxFile}`,
      });
      continue;
    }
    totalBytes += size;
  }

  if (totalBytes > maxTotal) {
    failures.push({
      code: 'total-too-large',
      path: '',
      detail: `${totalBytes} > ${maxTotal}`,
    });
  }

  return failures;
}

/**
 * Redact secrets from a free-form string before logging. Octokit
 * sometimes embeds the request URL (and therefore the auth token) in
 * its error messages; the Anthropic SDK occasionally surfaces the API
 * key in the same way. Operators run this CLI from CI, where stderr
 * lands in plain-text logs that the whole org can read — no secret
 * should ever survive the trip.
 *
 * Patterns covered:
 *   * GitHub PATs               (`ghp_…`, `github_pat_…`)
 *   * GitHub OAuth user tokens  (`gho_…`)
 *   * GitHub App tokens         (`ghs_…`, `ghu_…`)
 *   * Anthropic API keys        (`sk-ant-…`)
 *   * Generic Bearer headers    (`Authorization: Bearer …`)
 *   * GitHub installation token URLs (`x-access-token:<token>@github.com`)
 */
const TOKEN_PATTERNS: ReadonlyArray<{ pattern: RegExp; replacement: string }> = Object.freeze([
  { pattern: /ghp_[A-Za-z0-9]{20,}/g, replacement: 'ghp_***REDACTED***' },
  { pattern: /github_pat_[A-Za-z0-9_]{20,}/g, replacement: 'github_pat_***REDACTED***' },
  { pattern: /gh[osu]_[A-Za-z0-9]{20,}/g, replacement: 'gh*_***REDACTED***' },
  { pattern: /sk-ant-[A-Za-z0-9_-]{20,}/g, replacement: 'sk-ant-***REDACTED***' },
  {
    pattern: /(authorization:\s*bearer\s+)[A-Za-z0-9._-]{8,}/gi,
    replacement: '$1***REDACTED***',
  },
  {
    pattern: /(x-access-token:)[^@]+(@)/g,
    replacement: '$1***REDACTED***$2',
  },
]);

export function redactSecrets(input: string): string {
  let out = input;
  for (const { pattern, replacement } of TOKEN_PATTERNS) {
    out = out.replace(pattern, replacement);
  }
  return out;
}

/**
 * Redact-then-stringify an unknown thrown value, used by the CLI in
 * its top-level catch. Walks Error.message, .stack, and the JSON form
 * for non-Error throws.
 */
export function safeFormatError(err: unknown): string {
  if (err instanceof Error) {
    const parts = [redactSecrets(err.message)];
    if (err.stack) parts.push(redactSecrets(err.stack));
    return parts.join('\n');
  }
  try {
    return redactSecrets(JSON.stringify(err));
  } catch {
    return redactSecrets(String(err));
  }
}
