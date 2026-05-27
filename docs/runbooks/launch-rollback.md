# Launch-Day Rollback & Kill-Switch Runbook

A single page to consult when a launch goes wrong. It covers **when** to roll
back, the **fastest** lever (a runtime kill-switch that needs no new build), the
**slower** levers (OTA, npm, native store), an **incident comms** template, and
a **post-incident** checklist.

Read the [Kill-switch](#2-kill-switch-via-remote-config-fastest-no-new-build)
section first — flipping a remote-config feature flag is the lowest-latency,
lowest-blast-radius mitigation and is reversible in seconds.

> **Hosting model.** `@erne/monitor` is **self-hosted-by-default and shipping**;
> a managed **ERNE Cloud** is on the roadmap, not yet GA
> (see [pricing](../pricing.md)). This runbook is written for **self-hosters**:
> you control your own dashboard deploy, your npm publishes, and your app's
> release channels. When ERNE Cloud ships, the kill-switch (remote config) works
> the same way; only "who restarts the dashboard server" changes. Cloud-specific
> steps are marked **[Cloud — roadmap]**.

> **Org-specific values** appear as `[placeholders]` — fill them in for your
> deployment and keep this runbook current.

---

## 1. When to roll back

Decide on **severity first**, then pick the matching lever. Most launch-day
incidents are mitigated by the kill-switch (Section 2) while you investigate;
only ship a code change once the bleeding has stopped.

| Severity             | Definition                                                         | Example triggers                                                                 | Primary lever                                                            |
| -------------------- | ------------------------------------------------------------------ | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| **SEV-1 (critical)** | App unusable, data loss, or active security exposure               | Launch build crash-loops on boot; a collector leaks PII into events; auth bypass | Kill-switch **now** (§2), then OTA (§3) / native halt (§5)               |
| **SEV-2 (major)**    | Core flow broken for a large share of users, no data/security risk | A misbehaving collector spikes crash-rate or pins CPU; runaway network logging   | Kill-switch (§2) to disable the offending feature; OTA (§3) for a JS fix |
| **SEV-3 (minor)**    | Degraded but usable; cosmetic or low-traffic path                  | One non-critical screen errors; elevated but non-blocking error rate             | OTA (§3) at normal cadence; no kill-switch needed                        |

### Concrete triggers

- **Crash-rate spike** — new-release crash-free sessions drop below your launch
  gate of `[e.g. 99.5%]`, or a single crash group climbs to `[e.g. >2%]` of
  sessions. Watch this in the dashboard crash-groups view.
- **Bad release** — a JS/TS regression shipped via OTA or an npm bump; a native
  regression shipped via the store.
- **Security issue** — PII reaching the backend, a leaked secret, or an
  exploitable path. **Treat as SEV-1 regardless of user-facing impact.**
- **Runaway telemetry** — a collector floods the backend or the device
  (battery/CPU/network). Mitigate with the per-collector kill-switch (§2).

### Decision flow

```
Incident detected
       │
       ├─ Security / PII exposure? ───────────────► SEV-1 → kill-switch NOW (§2)
       │
       ├─ Can a runtime feature flag stop the
       │    bleeding without a new build? ─────────► flip the flag (§2)
       │
       ├─ JS/TS-only regression? ──────────────────► OTA rollback (§3)
       │
       └─ Native (binary) regression? ─────────────► halt store rollout (§5),
                                                       OTA-patch if possible (§3)
```

---

## 2. Kill-switch via remote config (fastest, no new build)

ERNE ships an operator-editable **remote config** (Task 117.17) with three
sections: `sampling`, `piiRules`, and **`featureFlags`**. The kill-switch is the
`featureFlags` map: each flag enables/disables a specific runtime collector. You
flip a flag with one authenticated `PUT /api/config`; **no app rebuild, no OTA,
no store submission** is required. SDKs pick the change up on their next poll.

### How SDKs pick it up

- The dashboard server exposes the config to SDKs at **`GET /v1/config`** (an
  unauthenticated read-only endpoint, separate from the operator's
  API-key-gated `/api/config`).
- Each app instance running the SDK's `RemoteConfigClient` polls `/v1/config` on
  a timer — **default every 5 minutes**
  (`DEFAULT_POLL_INTERVAL_MS = 5 * 60_000`). Worst-case propagation is roughly
  one poll interval plus a fetch; plan your comms ETA accordingly.
- On each fetch the SDK applies the config purely: `featureFlags` are **diffed**
  against the last-applied set, and only **changed** flags fire their
  collector's `start()` / `stop()`. A `true` value enables the collector; `false`
  disables it. **Unknown flags are silently ignored** — so it is always safe to
  set a flag the operator adds for a newer SDK, and older apps just skip it.

> Remote config requires the SDK to be initialised with remote config enabled
> (`remoteConfig: { enabled: true, … }` in `createMonitorRuntime`). If a client
> has it disabled, the kill-switch does not reach that client — fall back to OTA
> (§3) / native (§5).

### Known feature flags (the SDK's stable vocabulary)

Each maps to a collector with clean `start()` / `stop()` semantics. Set any
subset; omit the rest. These are the exact keys the runtime wires:

| Flag                 | Disables (when `false`)                       |
| -------------------- | --------------------------------------------- |
| `network`            | Network request/response collector            |
| `navigation`         | Navigation/route-change collector             |
| `render`             | Re-render / commit collector                  |
| `frameDrop`          | Frame-drop (FPS) collector                    |
| `memory`             | Memory-pressure collector                     |
| `longTask`           | Long-task collector                           |
| `state`              | State-change collector                        |
| `a11y`               | Accessibility collector                       |
| `image`              | Image-load collector                          |
| `storage`            | Storage-access collector                      |
| `frustration`        | Frustration-signal (rage-tap, etc.) collector |
| `dashboardStreaming` | Live dashboard streaming bridge               |

> `piiRules` only **tightens** redaction (adds sensitive keys / patterns), so it
> is also safe to push as a mitigation if a collector is leaking a field — add
> the field name (e.g. `email`) or a regex pattern to `piiRules`.

### Flip a flag — concrete request

`/api/config` is gated by the operator API key (set via `[ERNE_API_KEY]`). Pass
it as a bearer token (or `?apiKey=` query param). Use **`?merge=1`** so you only
send `featureFlags` and the server preserves the existing `sampling` and
`piiRules` sections.

**Disable the misbehaving `network` collector across all polling apps:**

```bash
curl -sS -X PUT "[DASHBOARD_BASE_URL]/api/config?merge=1" \
  -H "Authorization: Bearer [ERNE_API_KEY]" \
  -H "Content-Type: application/json" \
  -d '{ "featureFlags": { "network": false } }'
```

Successful response (HTTP 200) echoes the stored config with a fresh
`updatedAt`:

```json
{
  "config": {
    "sampling": {},
    "piiRules": [],
    "featureFlags": { "network": false },
    "updatedAt": 1748300000000
  }
}
```

Notes:

- Without `?merge=1`, a `PUT` **replaces the entire config** — any omitted
  section is reset to empty. Use `?merge=1` for surgical flag changes.
- Invalid input returns **HTTP 400** with an `errors` array and **leaves the
  stored config untouched** — a typo can't silently brick sampling.
- Every successful `PUT` writes a `config-change` row to the audit log (see §7).

**Verify the change is live** (this is the same payload SDKs receive):

```bash
# Operator view (API-key gated)
curl -sS "[DASHBOARD_BASE_URL]/api/config" \
  -H "Authorization: Bearer [ERNE_API_KEY]"

# SDK view (what apps actually poll — unauthenticated, read-only)
curl -sS "[DASHBOARD_BASE_URL]/v1/config"
```

**Re-enable / roll the kill-switch back** once a real fix has shipped — flip the
same flag to `true` (it fires `start()` again on the next poll):

```bash
curl -sS -X PUT "[DASHBOARD_BASE_URL]/api/config?merge=1" \
  -H "Authorization: Bearer [ERNE_API_KEY]" \
  -H "Content-Type: application/json" \
  -d '{ "featureFlags": { "network": true } }'
```

> **[Cloud — roadmap]** When ERNE Cloud ships, `[DASHBOARD_BASE_URL]` is the
> managed endpoint and `[ERNE_API_KEY]` is your Cloud-issued key; the
> `PUT /api/config` / `GET /v1/config` contract is identical.

---

## 3. OTA rollback (JS-only regressions)

For a **JS/TS-only** regression (no native-module / binary change), the fastest
permanent fix is an over-the-air update via **expo-updates / EAS Update**. OTA
**cannot** ship native code — if the regression is in a native module or a
binary-level change, go to Section 5.

The expo-updates model: each `eas update` publishes an update **group** to a
**channel** (e.g. `production`); clients on that channel pick up the newest
compatible update for their `runtimeVersion` on next launch (or via the
`expo-updates` API). Rolling back means making the **previous good** update the
one clients fetch.

### Option A — republish the previous good update (recommended)

Re-point the channel at a known-good update group. This is non-destructive and
the standard EAS path:

```bash
# 1. Find the bad update group and the previous good one on the channel
eas update:list --branch [PRODUCTION_BRANCH]

# 2. Republish the previous good group onto the same channel
eas update:republish --group [PREVIOUS_GOOD_GROUP_ID] \
  --message "Rollback: revert [BAD_GROUP_ID] (incident [INCIDENT_ID])"
```

Clients fetch the republished (good) update on their next update check. Confirm
your runtime version matches so eligible clients actually receive it.

### Option B — roll out / roll back via rollout percentage

If the bad update was shipped with a **staged rollout**, halt it by setting the
rollout to **0%** so no further clients receive it, then republish the good one:

```bash
# Stop the bad update reaching any more clients
eas update:edit --group [BAD_GROUP_ID] --rollout-percentage 0
```

> Confirm the exact `eas update` subcommand/flags against your installed EAS CLI
> version (`eas --version`) — flag names have shifted across CLI releases. The
> two strategies above (**republish previous** and **rollout → 0%**) are the
> stable concepts; the precise flag spelling is `[verify per CLI version]`.

### After OTA rollback

- Verify the good update is being served: check `eas update:list` and confirm a
  test device on the channel pulls the expected group.
- Watch the dashboard crash-rate for the rolled-back release to confirm
  recovery.

---

## 4. npm rollback (a bad published package)

If a bad version of `erne-universal` (or another published package) reached npm,
**do not reach for `npm unpublish` by reflex** — it is the wrong tool in most
cases.

### The 72-hour `npm unpublish` caveat

`npm unpublish` is only permitted **within 72 hours** of publish, and only if no
other public package depends on that version (npm policy). After 72 hours, npm
**will not unpublish** a public version. Even within the window, unpublishing a
version that consumers may have already installed/locked breaks reproducible
installs and is disruptive.

```bash
# Only within 72h of publish, and only if nothing depends on it:
npm unpublish erne-universal@[BAD_VERSION]
```

### Preferred: `deprecate` + publish a patched version

The supported rollback for an already-released bad version is to **deprecate** it
(so installers get a warning) and **publish a patched version** that supersedes
it:

```bash
# Warn anyone who installs the bad version
npm deprecate erne-universal@[BAD_VERSION] \
  "Buggy release — upgrade to [PATCHED_VERSION] (incident [INCIDENT_ID])"

# Then cut + publish the fix as a new version (via the normal Changesets flow)
# See docs/releasing/channels.md and CONTRIBUTING.md "Releasing".
```

### Re-point the `latest` dist-tag to the prior good version

A bare `npm install erne-universal` always resolves to the **`latest`** dist-tag.
If a bad version was tagged `latest`, repoint `latest` at the **prior good**
version so new installs stop picking up the bad one — this takes effect
immediately and does not require unpublishing:

```bash
npm dist-tag add erne-universal@[PRIOR_GOOD_VERSION] latest
```

> ERNE publishes to three channels via npm dist-tags — `latest` (stable),
> `next` (beta), `canary` (per-commit). See
> [docs/releasing/channels.md](../releasing/channels.md) for the full channel
> model and the Changesets promotion workflow. Repointing `latest` is the
> dist-tag lever; deprecate-and-patch is the version lever.

---

## 5. Native rollback (binary regression — slowest path)

A regression in **native code** (a native module, a binary-level change, app
config that affects the build) **cannot** be fixed by the kill-switch or OTA.
The only true rollback path is through the app stores, which is the **slowest**
lever because of **store review latency** (hours to days) and staged-release
mechanics. Mitigate via the kill-switch (§2) and/or an OTA patch (§3) **while**
the native path proceeds.

### Halt the rollout immediately (no review needed)

- **iOS (App Store Connect):** if the bad build is in **phased release**, **pause**
  the phased release. Pausing stops further automatic distribution but does not
  remove the build from users who already have it.
- **Android (Google Play Console):** if the bad release is a **staged rollout**,
  **halt** the staged rollout. You can then resume with a corrected release or
  reduce the rollout percentage.

> Halting/pausing a rollout is immediate and needs no review — do this **first**.

### Ship a corrected native build (review-gated)

- Submit a **new** build with the fix (you generally cannot re-promote an older
  binary as "newer"; ship a higher version/build number).
- **iOS:** request **expedited review** for a SEV-1 regression — note the
  incident and user impact in the review notes.
- **Android:** publish the corrected release to the same track; staged rollout
  can be set conservatively (e.g. `[start at 5–10%]`).
- **Expect review latency.** Until the corrected build is approved and rolled
  out, the kill-switch and/or OTA patch are your only mitigations for already-
  installed users.

### When OTA can cover a "native" incident

If the regression is actually JS sitting _on top of_ an unchanged native
runtime, an **OTA patch (§3)** can fix already-installed users without waiting
for store review. Only a genuine native-binary change forces the store path.

---

## 6. Incident comms template

Post a status update as soon as the incident is confirmed, then update on every
material change (mitigation applied, fix shipped, resolved). Fill in
`[placeholders]`.

```
[INCIDENT] [SEV-?] — [Short title]

Status:   [Investigating | Identified | Mitigating | Monitoring | Resolved]
Started:  [UTC timestamp]
Updated:  [UTC timestamp]
Owner:    [incident lead]

What's happening:
  [1–2 sentences, plain language. What's broken and since when.]

Impact:
  - Affected: [who / which platforms / which app versions / % of users]
  - Symptom:  [what users see — crash, broken flow, degraded perf]
  - Data/security: [None known | Under investigation | Confirmed — see below]

Mitigation in progress:
  - [e.g. Disabled the `network` collector via remote-config kill-switch
     (propagates within ~5 min as apps poll /v1/config).]
  - [e.g. Republished previous good OTA update [PREVIOUS_GOOD_GROUP_ID].]
  - [e.g. Paused App Store phased release / halted Play staged rollout.]

ETA:
  - Mitigation effective: [time — remember the ~5-min config poll interval]
  - Permanent fix:        [OTA: minutes–hours | native: hours–days incl. review]

Next update: [time, or "on material change"]
```

### Resolved update

```
[RESOLVED] [SEV-?] — [Short title]

Resolved:  [UTC timestamp]
Duration:  [start → resolved]

Summary:
  [What happened, what fixed it, and what users should do — if anything,
   e.g. "no action needed; update fetched automatically" or
   "update to [PATCHED_VERSION]".]

Follow-up:
  Post-incident review scheduled for [date]. See §7.
```

---

## 7. Post-incident checklist

Run this once the incident is **Resolved**. Capture findings in your incident
tracker / post-mortem doc.

- [ ] **Confirm recovery** — crash-rate and the affected metric have returned to
      baseline in the dashboard; the kill-switch flag (if used) has been rolled
      back to its normal value (§2).
- [ ] **Root cause** — identify the actual defect (not just the symptom). What
      shipped, in which lever (OTA / npm / native), and why it wasn't caught.
- [ ] **Audit-log review** — pull the operator action history around the
      incident window to reconstruct exactly which config changes were made,
      when, and by whom. The dashboard exposes this at **`GET /api/audit`**
      (API-key gated). Every kill-switch `PUT /api/config` writes a
      **`config-change`** row.

      ```bash
      curl -sS "[DASHBOARD_BASE_URL]/api/audit?action=config-change&since=[INCIDENT_START_MS]&until=[INCIDENT_END_MS]" \
        -H "Authorization: Bearer [ERNE_API_KEY]"
      ```

      Supported filters: `since`, `until`, `action`, `actor`, `targetType`,
      `targetId`, `limit`, `offset`. The `config-change` metadata records shape
      stats only (counts of sampling keys / PII rules / feature flags) — never
      PII-rule contents.

- [ ] **Regression test** — add a test that would have caught this. For
      perf/render regressions, add a [reassure](../../packages/monitor/README.md)
      perf-test; for logic, a unit/integration test. Don't close the incident
      until the test exists and fails on the bad commit.
- [ ] **Lever review** — was the right lever used first? Confirm the kill-switch
      was reached for before slower levers when applicable. Update this runbook
      if a step was wrong, slow, or missing.
- [ ] **Timeline & comms archive** — file the timeline (detected → mitigated →
      resolved) and archive the status updates.
- [ ] **Guardrail** — add/adjust an alert threshold (`[e.g. crash-free < 99.5%]`)
      so the next occurrence is caught earlier.

---

## Quick reference — levers by latency

| Lever                                            | Latency to effect                                      | Scope                           | Use for                                               |
| ------------------------------------------------ | ------------------------------------------------------ | ------------------------------- | ----------------------------------------------------- |
| **Kill-switch** (`PUT /api/config` featureFlags) | ~1 poll interval (**default 5 min**)                   | Per-collector, all polling apps | Misbehaving/leaking collector; SEV-1/2 first response |
| **OTA** (expo-updates / EAS Update)              | Minutes (next app launch / update check)               | JS/TS only, per channel         | JS regression                                         |
| **npm dist-tag** (`dist-tag add … latest`)       | Immediate for _new_ installs                           | Future installs of the package  | Bad published version                                 |
| **npm deprecate + patch**                        | Patch publish time                                     | Installers of the bad version   | Already-published bad version (esp. >72h)             |
| **Native store rollout halt**                    | Immediate to halt; **hours–days** to ship fix (review) | App binary, per store           | Native/binary regression                              |

See also: [release channels](../releasing/channels.md) ·
[pricing & hosting model](../pricing.md) ·
[getting started](../getting-started.md) ·
[@erne/monitor README](../../packages/monitor/README.md)
