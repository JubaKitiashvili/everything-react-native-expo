# Contributing a Pattern

The [ERNE Pattern Encyclopedia](README.md) launches with 20 built-in patterns, but
the registry is meant to grow. If you've seen a recurring React Native / Expo crash,
performance, UX, accessibility, or lifecycle problem that ERNE should recognize by
name, propose it here.

This guide covers the entry schema, where to add a pattern, how to keep the docs in
sync, the review criteria, and a worked example. It follows the same conventions as
the repo-wide [`CONTRIBUTING.md`](../../CONTRIBUTING.md) (Conventional Commits, atomic
PRs, the CLA, and the existing review bar) — read that first for the general flow.

---

## Two ways a pattern enters the registry

1. **Learned (automatic, per-project).** The SDK's pattern-sync can discover a
   pattern in your own app from `pattern_match` events and crash-group AI
   suggestions. It shows up in your dashboard's Pattern Library tagged `learned`
   with a match count and confidence — no PR required. This is local to your
   project.
2. **Built-in (this PR flow).** When a learned pattern is general enough to help
   every RN/Expo developer, promote it into the shared built-in catalog so it ships
   with the SDK and appears in this encyclopedia.

This guide is about path **2** — adding a built-in pattern.

---

## The entry schema

A built-in pattern is a single frozen object in `BUILT_IN_PATTERNS`. The shape is
the `BuiltInPattern` interface from
[`catalog.ts`](../../packages/monitor/dashboard/app/src/pages/quality/components/PatternLibrary/catalog.ts):

```ts
export type PatternCategory = 'crash' | 'perf' | 'ux' | 'a11y' | 'lifecycle';

export interface BuiltInPattern {
  id: string;
  name: string;
  category: PatternCategory;
  description: string;
}
```

| Field         | Type              | Rules                                                                                                                                                                                            |
| ------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `id`          | `string`          | **Stable, unique, kebab-case** identifier. This is the match key emitted by the SDK and the URL anchor in the docs — once shipped, **never rename it** (it would orphan every historical match). |
| `name`        | `string`          | Human-readable title (sentence case). What the dashboard row and the encyclopedia heading show.                                                                                                  |
| `category`    | `PatternCategory` | Exactly one of the five literals above. Pick where the problem lives, not where the symptom shows.                                                                                               |
| `description` | `string`          | The **remediation**: a one-sentence, actionable recommended fix. The encyclopedia renders this verbatim as "Recommended fix," so keep it imperative and specific.                                |

### Field conventions

- **`id`** — lowercase, hyphen-separated, no leading category prefix unless it
  genuinely disambiguates (e.g. `startup-long-native-init`). Match the casing of the
  existing entries.
- **`name`** — short and scannable. Mirror how an RN developer would describe the
  bug out loud ("Re-render storm," "Keyboard covers input").
- **`category`** — use `CATEGORY_LABEL` in `catalog.ts` as the source of truth for
  what each category means. If a pattern could fit two categories, file it under the
  root cause: a crash _caused by_ a `5xx` is `crash`, not `perf`.
- **`description`** — the fix, not the symptom. "Memoize props + wrap the component"
  is good; "component renders too much" is not.

---

## Where to add it

1. **Source catalog (required).** Append your object to the `BUILT_IN_PATTERNS`
   array in
   [`catalog.ts`](../../packages/monitor/dashboard/app/src/pages/quality/components/PatternLibrary/catalog.ts).
   Add it to the end so existing ordering is undisturbed, grouped near the other
   patterns of the same category to match the file's layout.
2. **Encyclopedia entry (required).** Add a matching section to
   [`README.md`](README.md) under the correct category heading, in the same style as
   the existing entries: a level-3 heading with the `name`, then the bullet list
   (**Category**, **`id`**, **What it is**, **How ERNE detects it**, **Recommended
   fix**). The **Recommended fix** must match the catalog `description` word-for-word.
3. **Table of contents + count (required).** Add the new entry to the TOC and bump
   the per-category and total counts in both the **Categories** table and the
   Pattern Library panel's "N built-in" copy. The launch total is **20**; keep every
   counter in agreement.
4. **Detection (recommended).** A built-in pattern is only useful if something
   actually emits a `pattern_match` for its `id`. If the SDK can't yet detect it,
   say so in the PR and link the detector you'd add — a documented-but-undetected
   pattern is acceptable as a first step, but call it out so reviewers know.

> Keep the catalog, the encyclopedia, and the in-product panel in lockstep. The
> whole point of `catalog.ts` being the single source of truth is that the docs and
> the dashboard never disagree about what patterns exist.

---

## Review criteria

Reviewers check, in addition to the repo-wide bar in [`CONTRIBUTING.md`](../../CONTRIBUTING.md):

- **Generality.** Does this help most RN/Expo apps, or is it specific to one
  codebase? Project-specific patterns belong as `learned`, not built-in.
- **Distinctness.** Is it meaningfully different from an existing pattern? Don't
  split one problem across two near-duplicate entries.
- **Correct category.** Filed under root cause, using one of the five
  `PatternCategory` literals.
- **Actionable fix.** The `description` tells a developer what to _do_, in one
  sentence, imperatively.
- **Stable `id`.** Unique, kebab-case, and one you're willing to keep forever.
- **Docs in sync.** `catalog.ts`, `README.md`, the TOC, and all counts agree.
- **No invented numbers.** Detection thresholds in the docs must match what the SDK
  actually measures — don't fabricate stats.
- **Honest detection status.** If detection isn't wired up yet, the PR says so.

---

## Worked example

Say you keep seeing apps freeze when a `FlatList` re-keys its entire dataset on every
render. You want to add a built-in `perf` pattern.

**1. Add to `catalog.ts`** (appended to `BUILT_IN_PATTERNS`, near the other `perf`
entries):

```ts
{
  id: 'unstable-list-keys',
  name: 'Unstable list keys',
  category: 'perf',
  description: 'keyExtractor returns a new value each render — derive a stable id from the item.',
},
```

**2. Add the encyclopedia entry** to [`README.md`](README.md) under **📈 Performance**:

```markdown
### Unstable list keys

- **Category:** Performance · `perf`
- **`id`:** `unstable-list-keys`
- **What it is:** A list whose `keyExtractor` produces a fresh key on every render,
  forcing every row to unmount and remount instead of reconciling in place.
- **How ERNE detects it:** ERNE correlates list-row remount churn against unchanged
  underlying data and flags the mismatch.
- **Recommended fix:** keyExtractor returns a new value each render — derive a stable
  id from the item.
```

**3. Update the TOC** (add `- [Unstable list keys](#unstable-list-keys)` under
Performance) **and the counts** (Performance `8 → 9`, total `20 → 21`, and the
"N built-in" copy in `PatternLibrary.tsx` / its panel description).

**4. Open the PR.** Use Conventional Commits
(`feat(patterns): add unstable-list-keys pattern`), note whether detection is wired
up, and follow the [Pull Request Process](../../CONTRIBUTING.md#pull-request-process)
in the root contributing guide (including the one-time CLA signature).

---

## See also

- **[Pattern Encyclopedia](README.md)** — the full registry these entries join.
- **[`@erne/monitor` README](../../packages/monitor/README.md)** — how the
  Intelligence pipeline and pattern library fit into the SDK.
- **[Getting Started](../getting-started.md)** — set up ERNE so you can see your new
  pattern match live in the dashboard.
- **Repo-wide [`CONTRIBUTING.md`](../../CONTRIBUTING.md)** — Conventional Commits,
  branch naming, the CLA, and the general PR process.
