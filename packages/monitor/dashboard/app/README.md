# @erne/monitor — Dashboard App

Vite + React 19 + TypeScript front-end for the local `@erne/monitor` dashboard.
Builds to `../public/` and is served by the dashboard server (Task 94+).

## Scripts

```bash
npm install        # install deps (first time)
npm run dev        # Vite dev server on http://127.0.0.1:5173
npm run build      # typecheck + Vite build → ../public
npm run preview    # serve the built bundle from ../public
npm run typecheck  # tsc --build --pretty (no emit)
npm run lint       # ESLint 9 flat config
npm run format     # Prettier write
```

## Layout

```
dashboard/app/
├── index.html
├── package.json
├── vite.config.ts
├── tsconfig.json          (references app + node)
├── tsconfig.app.json      (strict, DOM, React 19 JSX)
├── tsconfig.node.json     (Vite config)
├── eslint.config.js       (ESLint 9 flat + typescript-eslint + react-hooks + react-refresh)
├── .prettierrc.json
└── src/
    ├── main.tsx           (React root)
    ├── App.tsx            (shell placeholder — panels land in Task 97+)
    ├── App.module.css
    ├── index.css
    └── vite-env.d.ts
```

## Why this directory

Phase 6 of the monitor SDK plan replaces the bootstrap HTML dashboard (single
static file, 388 lines) with a production UI. This directory is the source for
that UI; the existing `../public/` directory is the build output consumed by the
dashboard server.

Task boundaries:

- **Task 92** (this scaffold) — Vite + React + TS shell, `npm run build` emits
  to `../public/`.
- **Task 93** — design tokens + base UI kit in `src/shared/ui/`.
- **Task 94** — SQLite persistent backend (server-side).
- **Task 95** — WebSocket ingest wired to SQLite store.
- **Task 96** — TanStack Query + zustand realtime hooks.
- **Tasks 97–113** — 17 panels, one directory each under `src/panels/`.
