# ERNE Pattern Encyclopedia

> A public registry of the recognized React Native / Expo crash, performance, UX,
> accessibility, and lifecycle patterns that `@erne/monitor` detects at runtime —
> each with what it is, how ERNE recognizes it, and the recommended fix.

The Pattern Encyclopedia is the human-readable companion to the **Pattern Library**
that ships inside the SDK and surfaces in the dashboard. Where the dashboard shows
you _which_ patterns matched in your app and how confident the match is, this page
explains _what each pattern means_ and _how to resolve it_.

It launches with **20 built-in patterns** across five categories. The registry is
community-extensible: the SDK's pattern-sync can learn new patterns from your own
project, and anyone can propose a new built-in pattern via a pull request — see
**[CONTRIBUTING.md](CONTRIBUTING.md)**.

---

## How this maps to the in-product Pattern Library

The 20 patterns below are the authoritative built-in catalog. They live in source at
[`catalog.ts`](../../packages/monitor/dashboard/app/src/pages/quality/components/PatternLibrary/catalog.ts)
(`BUILT_IN_PATTERNS`), and this page is generated from that same list — there are no
patterns here that aren't in the catalog, and no invented detection numbers.

In the dashboard's **Pattern Library** panel ([`PatternLibrary.tsx`](../../packages/monitor/dashboard/app/src/pages/quality/components/PatternLibrary/PatternLibrary.tsx)):

- Every built-in pattern is always listed, even before it has matched any event
  (so you can browse the full library).
- When the SDK emits a `pattern_match` event, or a crash group carries an
  `aiSuggestion`, the matching row gains a **match count** and a **recency-weighted
  confidence** (a 0–1 score that decays toward 0 as the last match ages — see
  `computeDecayedConfidence` in [`aggregate.ts`](../../packages/monitor/dashboard/app/src/pages/quality/components/PatternLibrary/aggregate.ts)).
- A pattern that matched but **isn't** in the built-in catalog is shown as
  **`learned`** — the pattern-sync discovered it in your project. Learned patterns
  are how the registry grows in the field; promoting a recurring one into the
  built-in catalog is exactly what the [contribution flow](CONTRIBUTING.md) is for.

So: this encyclopedia documents the **built-in** patterns. Your dashboard may show
additional **learned** patterns specific to your codebase.

Each entry maps to a pattern field-for-field:

| Encyclopedia heading | `catalog.ts` field                                          |
| -------------------- | ----------------------------------------------------------- |
| Entry slug / anchor  | `id`                                                        |
| Entry title          | `name`                                                      |
| **Category**         | `category` (`crash` · `perf` · `ux` · `a11y` · `lifecycle`) |
| **Recommended fix**  | `description` (the catalog stores the remediation guidance) |

The **What it is** and **How ERNE detects it** notes below expand on the catalog
entry; the recommended fix is taken verbatim from the catalog so the docs and the
product never drift.

---

## Categories

| Category         | `id`        | Patterns     |
| ---------------- | ----------- | ------------ |
| 💥 Crash         | `crash`     | 4            |
| 📈 Performance   | `perf`      | 8            |
| 👆 UX            | `ux`        | 4            |
| ♿ Accessibility | `a11y`      | 2            |
| 🔄 Lifecycle     | `lifecycle` | 2            |
|                  |             | **20 total** |

---

## Table of contents

**💥 Crash**

- [Cannot read property of undefined](#cannot-read-property-of-undefined)
- [Unhandled promise rejection](#unhandled-promise-rejection)
- [5xx server error](#5xx-server-error)
- [Network request timeout](#network-request-timeout)

**📈 Performance**

- [Oversized image](#oversized-image)
- [Re-render storm](#re-render-storm)
- [Wasted Activity render](#wasted-activity-render)
- [Long JS task](#long-js-task)
- [Slow Fabric commit](#slow-fabric-commit)
- [Slow Suspense fallback](#slow-suspense-fallback)
- [Memory pressure](#memory-pressure)
- [AsyncStorage pressure](#asyncstorage-pressure)

**👆 UX**

- [Rage tap](#rage-tap)
- [Dead zone](#dead-zone)
- [Frustration scroll](#frustration-scroll)
- [Keyboard covers input](#keyboard-covers-input)

**♿ Accessibility**

- [Missing a11y label](#missing-a11y-label)
- [Low contrast text](#low-contrast-text)

**🔄 Lifecycle**

- [Background activity leak](#background-activity-leak)
- [Slow native init](#slow-native-init)

---

## 💥 Crash

Patterns that lead to — or directly are — an app crash. These match against the
crash and unhandled-rejection collectors and against `5xx` / timeout network events.

### Cannot read property of undefined

- **Category:** Crash · `crash`
- **`id`:** `cannot-read-property`
- **What it is:** A dereference of a property on a value that is `undefined` (or
  `null`) — the single most common JS crash in RN apps, usually from data that
  arrived later, partially, or not at all.
- **How ERNE detects it:** The crash collector matches the thrown `TypeError`
  message shape (`Cannot read property … of undefined`) against this pattern and
  attaches it to the crash group.
- **Recommended fix:** Guard with optional chaining or a non-null fallback before
  dereferencing.

### Unhandled promise rejection

- **Category:** Crash · `crash`
- **`id`:** `unhandled-rejection`
- **What it is:** A `Promise` rejected with no `.catch()` and no surrounding error
  boundary, so the rejection escapes to the bridge and can take down the app.
- **How ERNE detects it:** The unhandled-rejection collector captures rejections
  that reach the global handler (burst-coalesced) and matches them to this pattern.
- **Recommended fix:** Attach `.catch()` or an error boundary; rejections must not
  escape to the bridge.

### 5xx server error

- **Category:** Crash · `crash`
- **`id`:** `server-5xx`
- **What it is:** The app's backend returned a `5xx` status. Even when it doesn't
  crash, an unhandled `5xx` typically strands the user on a broken or blank screen.
- **How ERNE detects it:** The network collector flags responses in the `500–599`
  range and matches them to this pattern.
- **Recommended fix:** Retry with backoff or surface a user-visible offline state.

### Network request timeout

- **Category:** Crash · `crash`
- **`id`:** `network-timeout`
- **What it is:** A request that never resolves within its deadline — the user is
  left staring at a spinner or a blank screen.
- **How ERNE detects it:** The network collector flags requests that exceed their
  timeout (or never complete) and matches them to this pattern.
- **Recommended fix:** Set a per-call timeout; show an inline error instead of a
  blank screen.

---

## 📈 Performance

Patterns sourced from the RN-internal performance collectors: render, Fabric commit,
long-task observer, memory polling, and image/storage instrumentation.

### Oversized image

- **Category:** Performance · `perf`
- **`id`:** `oversized-image`
- **What it is:** An image decoded at a far larger resolution than it's displayed
  at, burning memory and decode time for pixels the user never sees.
- **How ERNE detects it:** ERNE compares an image's intrinsic dimensions against its
  rendered layout size and flags a large mismatch.
- **Recommended fix:** Resize at the source; render at the layout size, not the
  intrinsic size.

### Re-render storm

- **Category:** Performance · `perf`
- **`id`:** `render-storm`
- **What it is:** A component (or subtree) re-rendering many times in a short window,
  usually from unstable props or an over-broad subscription.
- **How ERNE detects it:** The render collector counts renders per component over a
  window and matches a high-frequency burst to this pattern.
- **Recommended fix:** Memoize props + wrap the component; check Reanimated worklet
  dependencies.

### Wasted Activity render

- **Category:** Performance · `perf`
- **`id`:** `wasted-activity-render`
- **What it is:** An inactive (off-screen / backgrounded) screen re-rendering with
  identical props — pure wasted work the user can't even see.
- **How ERNE detects it:** ERNE correlates render events against screen
  activity/visibility state and flags renders on inactive screens whose props didn't
  change.
- **Recommended fix:** Inactive screen re-rendered with identical props. Add
  `React.memo` or move state up.

### Long JS task

- **Category:** Performance · `perf`
- **`id`:** `long-js-task`
- **What it is:** A single JS task that blocks the thread long enough to drop frames
  and delay touch handling.
- **How ERNE detects it:** The long-task observer measures task duration on the JS
  thread and matches over-budget tasks to this pattern.
- **Recommended fix:** Break the work into `InteractionManager` batches or a worklet.

### Slow Fabric commit

- **Category:** Performance · `perf`
- **`id`:** `slow-fabric-commit`
- **What it is:** A Fabric commit that takes longer than one frame (> 16 ms),
  meaning the new UI didn't make it to screen in time.
- **How ERNE detects it:** The Fabric commit collector times each commit and matches
  any commit over the frame budget to this pattern.
- **Recommended fix:** Commit > 16ms; check layout thrashing + shadow-tree depth.

### Slow Suspense fallback

- **Category:** Performance · `perf`
- **`id`:** `slow-suspense-fallback`
- **What it is:** A Suspense boundary whose fallback is on screen long enough to
  read as a stall rather than a momentary placeholder.
- **How ERNE detects it:** ERNE measures how long a Suspense fallback is mounted
  before its content resolves and matches over-long durations to this pattern.
- **Recommended fix:** Promote the skeleton into the cacheable fallback; preload the
  data upstream.

### Memory pressure

- **Category:** Performance · `perf`
- **`id`:** `memory-pressure`
- **What it is:** The app's memory footprint climbing toward the OS's reclaim
  threshold, risking a low-memory kill.
- **How ERNE detects it:** The memory poller watches resident usage and OS
  memory-warning signals and matches sustained high pressure to this pattern.
- **Recommended fix:** Release image caches + unmount dev-only devtools on
  background.

### AsyncStorage pressure

- **Category:** Performance · `perf`
- **`id`:** `asyncstorage-pressure`
- **What it is:** High-volume or hot-path `AsyncStorage` access serializing through
  a single key-value store and stalling the JS thread.
- **How ERNE detects it:** ERNE instruments storage access frequency/volume and
  matches a heavy-usage profile to this pattern.
- **Recommended fix:** Batch writes + migrate to MMKV for hot-path keys.

---

## 👆 UX

Patterns inferred from interaction telemetry — taps, scrolls, and focus — that
signal user frustration even when nothing technically crashed.

### Rage tap

- **Category:** UX · `ux`
- **`id`:** `rage-tap`
- **What it is:** The classic frustration signal: the user jabbing the same control
  repeatedly because nothing is happening.
- **How ERNE detects it:** ERNE counts taps on the same target within a short window
  and flags 3+ taps with no resulting state change.
- **Recommended fix:** User tapped 3+ times on the same target with no state change.

### Dead zone

- **Category:** UX · `ux`
- **`id`:** `dead-zone`
- **What it is:** A region that looks tappable (it's styled like a control) but has
  no touch handler — taps land and do nothing.
- **How ERNE detects it:** ERNE correlates a tap location against the interactive
  hit-test tree and flags taps that fell on a non-interactive region.
- **Recommended fix:** Tap fell into a non-interactive region that looks tappable.

### Frustration scroll

- **Category:** UX · `ux`
- **`id`:** `frustration-scroll`
- **What it is:** Rapid back-and-forth scrolling — the user hunting for something
  that jumped, reflowed, or vanished under them.
- **How ERNE detects it:** ERNE detects reversing scroll direction repeatedly within
  a ~2-second window and matches it to this pattern.
- **Recommended fix:** Rapid back-and-forth scroll within 2s — likely a layout
  surprise.

### Keyboard covers input

- **Category:** UX · `ux`
- **`id`:** `keyboard-covers-input`
- **What it is:** A focused `TextInput` sitting partly (or fully) behind the
  on-screen keyboard, so the user can't see what they're typing.
- **How ERNE detects it:** ERNE compares the focused input's frame against the
  keyboard frame and flags an overlap.
- **Recommended fix:** `TextInput` focused but partly under the keyboard. Add
  `KeyboardAvoidingView`.

---

## ♿ Accessibility

Patterns that fail screen-reader users or low-vision users. These map to WCAG
expectations for React Native components.

### Missing a11y label

- **Category:** Accessibility · `a11y`
- **`id`:** `missing-a11y-label`
- **What it is:** A tappable element with no `accessibilityLabel`, so VoiceOver /
  TalkBack announces nothing meaningful.
- **How ERNE detects it:** ERNE inspects interactive elements in the layout snapshot
  and flags tappable nodes that have no accessibility label.
- **Recommended fix:** Tappable element without `accessibilityLabel`. VoiceOver reads
  nothing.

### Low contrast text

- **Category:** Accessibility · `a11y`
- **`id`:** `low-contrast`
- **What it is:** Text whose color against its background falls below the WCAG AA
  contrast ratio, making it hard to read.
- **How ERNE detects it:** ERNE computes the text/background contrast ratio from the
  layout snapshot and flags ratios below WCAG AA (4.5:1).
- **Recommended fix:** Text/background contrast below WCAG AA 4.5:1.

---

## 🔄 Lifecycle

Patterns tied to mount/unmount and app/process lifecycle — the work that outlives
the thing that started it, or blocks the thing that needs to start.

### Background activity leak

- **Category:** Lifecycle · `lifecycle`
- **`id`:** `background-activity-leak`
- **What it is:** A timer, subscription, or observer that kept running after its
  component unmounted — a classic memory/CPU leak.
- **How ERNE detects it:** ERNE correlates ongoing activity (timers, subscriptions,
  observers) against component unmount and flags activity that survived its owner.
- **Recommended fix:** Timer / subscription / observer survived unmount — schedule
  cleanup in `useEffect`.

### Slow native init

- **Category:** Lifecycle · `lifecycle`
- **`id`:** `startup-long-native-init`
- **What it is:** A native module taking too long during app startup, pushing out
  time-to-interactive.
- **How ERNE detects it:** The startup collector times native module initialization
  and flags any initializer over its threshold.
- **Recommended fix:** Native module took > 500ms during startup. Defer non-critical
  initialisers.

---

## See also

- **[Contributing a pattern](CONTRIBUTING.md)** — the schema, where to add a pattern,
  review criteria, and a worked example.
- **[`@erne/monitor` README](../../packages/monitor/README.md)** — what the SDK
  captures and how the Intelligence pipeline (signal router → pattern library →
  anomaly detector) works.
- **[Getting Started](../getting-started.md)** — install ERNE and the monitor SDK,
  then start the dashboard to see these patterns light up live.
- **Source of truth:** [`catalog.ts`](../../packages/monitor/dashboard/app/src/pages/quality/components/PatternLibrary/catalog.ts)
  (`BUILT_IN_PATTERNS`) · aggregation in [`aggregate.ts`](../../packages/monitor/dashboard/app/src/pages/quality/components/PatternLibrary/aggregate.ts).
