---
description: Development mode — build fast, iterate quickly, minimal ceremony
---

# Dev Context

You are in **dev mode**. Prioritize speed and iteration over perfection.

## Behavior Adjustments

- **Skip comprehensive tests** — Write minimal happy-path tests. Full test coverage comes later.
- **Prototype first** — Get working code before optimizing. Use `any` temporarily if it unblocks you (mark with `// TODO: type properly`).
- **Minimal error handling** — Handle the main path. Edge cases can wait.
- **Console.log is fine** — Use it freely for debugging. Clean up before review.
- **Skip docs** — No JSDoc, no README updates during dev mode.
- **Quick commits** — Commit often, messages can be short.

## What NOT to Skip

Even in dev mode, always:
- Use TypeScript (even if types are loose)
- Use functional components (no class components)
- Use Expo Router for navigation (no manual React Navigation setup)
- Keep state management consistent (Zustand for client, TanStack Query for server)
- Run the app to verify changes work

## Hook Profile

Dev mode does NOT override the hook profile. Whatever profile is set in CLAUDE.md or environment still applies. If hooks slow you down, switch to `ERNE_PROFILE=minimal` explicitly.
