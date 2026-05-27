# ERNE Monitor — VS Code Extension

Surfaces `@erne/monitor` crash data directly in your editor. Files that map to a
crashing screen get an inline **CodeLens** at the top showing the crash count,
and clicking it opens that crash group in the ERNE dashboard.

## Features

- **Inline crash counts (CodeLens).** When you open a source file whose name
  matches a known crashing screen (e.g. `Home.tsx` ↔ a `Home` screen), a lens
  appears at line 1: `⚠ 12 crashes — open in ERNE`.
- **Jump to the dashboard.** Clicking the lens runs the
  `erne-monitor.openCrash` command, which opens
  `<dashboardUrl>/crashes/<fingerprint>` (the highest-volume crash on that
  screen) in your browser via `vscode.env.openExternal`.
- **Live crash data.** On startup and whenever the config changes, the extension
  fetches crash groups from `<dashboardUrl>/api/crash-groups` and re-aggregates
  them by screen. Network failures are swallowed — a down dashboard never breaks
  the editor (lenses simply don't appear).

## Configuration

| Setting                    | Default                  | Description                                                                                       |
| -------------------------- | ------------------------ | ------------------------------------------------------------------------------------------------- |
| `erne-monitor.dashboardUrl` | `http://localhost:4174`  | Base URL of the ERNE Monitor dashboard. Crash links and the crash-groups API are derived from it. |
| `erne-monitor.apiKey`       | `""`                     | Optional. When set, sent as `Authorization: Bearer <key>` on crash-groups requests.               |

The command `erne-monitor.openCrash` ("ERNE: Open crash in dashboard") is also
available from the Command Palette.

## Architecture

The substance lives in pure, dependency-injected modules under `src/core/` (no
`vscode` import), with a thin glue layer in `src/extension.ts`.

```
src/
  core/
    types.ts          # CrashGroup / CrashIndex shapes
    dashboardUrl.ts   # crashUrl(base, fingerprint) — URL build + encode + slash normalize
    crashClient.ts    # fetchCrashGroups(base, { fetchImpl, apiKey }) — GET /api/crash-groups
    crashIndex.ts     # buildCrashIndex(groups) + codeLensText(entry) — aggregate by screen
    matchFile.ts      # screenForDocumentPath(path, screens) — file → screen matching
    *.test.ts         # vitest unit tests for the above
  extension.ts        # 🟡 vscode glue: CodeLensProvider + openCrash command + config
```

## Build & test

```bash
npm install      # standalone — installs into this package's own node_modules
npm run typecheck   # tsc --noEmit (resolves the `vscode` import via @types/vscode)
npm test            # vitest run — the src/core logic tests
npm run build       # tsc → dist/extension.js
```

## What is tested vs. 🟡 not headlessly verifiable

**Unit-tested (vitest, `src/core/*.test.ts`):**

- Crash URL building, percent-encoding, and trailing-slash normalization.
- The crash-groups API client: parses the response, sends `Bearer` only when an
  API key is set, and returns `[]` on non-ok responses and thrown fetches.
- Crash aggregation by screen (`count` sum, `topFingerprint` selection,
  ignoring groups without a `topScreen`) and singular/plural lens text.
- File → screen matching (basename, extension-stripped, case-insensitive,
  `null` when nothing matches).

**🟡 NOT covered by these unit tests — requires the VS Code extension host:**

- The live extension behavior — CodeLens actually rendering in the editor, the
  `erne-monitor.openCrash` command executing, and `vscode.env.openExternal`
  opening the browser. Verifying these needs the extension host
  (`@vscode/test-electron` + a display) and is out of scope for the headless
  unit suite. `src/extension.ts` is intentionally a thin shell that delegates
  every decision to the unit-tested `src/core/` modules.
- **Publishing to the VS Code Marketplace** (packaging with `vsce`, publisher
  account, signing) is operator setup and not performed here.
