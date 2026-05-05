# @erne/benchmarks

Reproducible benchmark suite comparing **`@erne/monitor`** against **Sentry React Native**, **measure.sh**, and **Bitdrift Capture** across four axes:

| Benchmark | Question | Method |
|---|---|---|
| `bundle_size` | How many gzipped KB does each SDK add to a Metro bundle? | Walk the published entry's transitive ESM/CJS import graph, gzip every leaf, sum |
| `crash_latency` | From `throw` to the first persisted event, how many ms? | In-process collector pipeline, monotonic clock, p50/p95/p99 over N iterations |
| `install_time` | How long does `npm install <subject>` take from a cold cache? | `child_process.spawnSync` into a tmp dir; warm vs cold separated |
| `symbolication_accuracy` | What % of fixture stack frames resolve correctly? | Known mapping + ground-truth, run subject's resolver, score by exact-match line |

All four benchmarks live in `src/benchmarks/`. All four subjects live in `src/subjects/`. Adding a new SDK means writing one file in `src/subjects/`.

## Status (Task 117.91)

The suite ships with the **harness** at production quality and the **`erne` subject** wired to the real `@erne/monitor` package living next door in this monorepo. **`sentry` / `measure.sh` / `bitdrift` ship as documented placeholders** — each Subject file describes the exact integration steps a contributor needs to perform to fill it in. Until then, the placeholders return `status: 'placeholder'` and the runner shows their rows as "not measured" rather than fabricating numbers.

> This package is the **prototype** of `github.com/ernedev/erne-benchmarks`. When the standalone repo lands, copy `packages/benchmarks/` into it verbatim — there is no monorepo coupling beyond the file path of the `erne` subject's `@erne/monitor` import.

## Reproducibility

Every benchmark accepts a deterministic clock + RNG so results are stable run-to-run inside a fixed environment. CI runs on a single GitHub-hosted `ubuntu-latest` runner so the comparison is apples-to-apples across subjects. We publish:

- the exact Node version
- the exact runner image SHA
- the per-subject CPU/memory/IO ceilings observed during the run
- the seed used for sampled benchmarks (e.g. crash_latency)

These five inputs make the numbers reproducible by anyone — drop the suite into the same image with the same seed, you get the same table.

## Quickstart

```bash
cd packages/benchmarks
npm install
npm run bench           # runs every benchmark × every subject
npm run bench:dry       # runs everything except install_time (no network)
npm run bench -- --benchmark=bundle_size
npm run bench -- --subject=erne
npm run bench -- --out=results.md
```

Output is Markdown by default. Pass `--json` for machine-readable output suitable for the docs site.

## Adding a subject

```ts
// src/subjects/your-sdk.ts
import type { Subject } from '../types.js';

export const yourSdkSubject: Subject = {
  id: 'your-sdk',
  label: 'Your SDK',
  packageName: 'your-sdk-monitor',
  version: '1.2.3',
  status: 'native',
  notes: 'Wired to real your-sdk-monitor build',
  async measureBundleSize(_ctx) { /* ... */ },
  async measureCrashLatency(_ctx) { /* ... */ },
  async measureInstallTime(_ctx) { /* ... */ },
  async measureSymbolicationAccuracy(_ctx) { /* ... */ },
};
```

Then add `yourSdkSubject` to `src/subjects/index.ts` and the runner picks it up automatically.

## Methodology details

### `bundle_size`

The harness walks every ESM `import` and CJS `require` from the entry file, transitively, computing each leaf's gzipped size in isolation (no shared dictionary across files — this matches Metro's per-module behaviour). The result is the sum of every reachable JS file's gzipped bytes.

This intentionally **does not** measure tree-shaken size. Real apps get smaller numbers because Metro/Hermes drop unused exports — but tree-shaken size depends on the consumer's import set, so it's not comparable across SDKs without nailing down a fixture app. We report "full surface" for stability; real-world numbers are documented separately per subject.

### `crash_latency`

A worker thread starts a real CrashCollector + EventStore. The main thread `throw`s on a tight schedule (default 1000 iterations), and we record `performance.now()` at:

1. immediately before `throw`
2. inside the collector's `onError` callback (when the event lands in the store)

The delta is `latency_ms`. We report p50, p95, p99, and max. Min isn't useful — best-case is dominated by V8's branch predictor. Worst-case (max) is what catches a slow path or a GC pause.

### `install_time`

`spawnSync('npm', ['install', '<package>'])` into a fresh tmp dir. We do this twice: once with the npm cache primed (warm) and once after `npm cache clean --force` (cold). Both numbers ship — the warm number is what your CI sees, the cold number is what your machine sees the first time.

### `symbolication_accuracy`

Each subject ships a fixture: a 50-frame stack trace with a known mapping. The harness asks the subject's resolver to produce the original `(file, function, line)` for each frame, then scores `correct / total`. We report the % and the per-category breakdown (Hermes / ProGuard / dSYM where applicable).

## CI

`.github/workflows/benchmarks.yml` runs `npm test` + `npm run bench:dry` on every PR. The full suite (including `install_time`, which hits npm registry) runs nightly on `main`.

## License

MIT, same as `@erne/monitor`.
