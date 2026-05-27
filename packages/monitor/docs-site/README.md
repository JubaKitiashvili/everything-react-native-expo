# @erne/monitor-docs-site

Documentation site for [`@erne/monitor`](../), built with
[Astro](https://astro.build) + [Starlight](https://starlight.astro.build).

This package is **self-contained**: it has its own `package.json` and its own
`node_modules`, and is intentionally **not** part of the repo's npm workspaces.
Install and run it only from inside this directory.

## Develop

```bash
cd packages/monitor/docs-site
npm install
npm run dev      # local dev server with hot reload (http://localhost:4321)
```

## Build

```bash
npm run build    # static build → ./dist
npm run preview  # serve the built ./dist locally
```

Starlight validates internal `[text](/path)` links against the content
collection at build time, so a clean `npm run build` is also a broken-link
check — it fails the build on any link that doesn't resolve.

## Content

Docs live as MD / MDX under `src/content/docs/`:

| File                  | Page                          |
| --------------------- | ----------------------------- |
| `index.mdx`           | Landing / overview            |
| `getting-started.md`  | Install + wire the SDK        |
| `sdk-configuration.md`| Collectors, sampling, PII, remote config |
| `self-hosting.md`     | Dashboard on SQLite / Postgres, RBAC, ingest keys |
| `mcp-integration.md`  | MCP server + AI Fix PR agent  |

Site configuration (title, sidebar, social links) lives in `astro.config.mjs`.

## Notes

Content is sourced from the real `@erne/monitor` package material — the package
README, SDK source under `packages/monitor/src/`, the dashboard server under
`packages/monitor/dashboard/server/src/`, and the MCP tools under
`packages/monitor/mcp/`. No performance numbers, competitor claims, or pricing
are invented here.
