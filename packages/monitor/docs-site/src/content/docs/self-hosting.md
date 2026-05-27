---
title: Self-hosting the dashboard
description: Run the @erne/monitor dashboard server on SQLite or Postgres, configure env vars, RBAC, and ingest keys.
---

The dashboard is a self-hostable Node HTTP server that ingests events, groups
crashes, and serves the UI (live feed, crash groups, sessions, metrics). It is
**self-hosted by default** — there is no vendor backend. This page covers running
it on SQLite or Postgres, the environment variables it reads, RBAC, and ingest
keys.

## Quick start (SQLite)

```bash
npx @erne/monitor dashboard
```

This starts the server on port `3333` and persists events to SQLite at
`~/.erne/monitor/dashboard.db` (created on first use). The UI is served at
`http://127.0.0.1:3333/`. Flags:

```bash
npx @erne/monitor dashboard --open          # open a browser
npx @erne/monitor dashboard --port 4000      # override the port
npx @erne/monitor dashboard --host 0.0.0.0   # bind a non-loopback host
npx @erne/monitor dashboard --db ./events.db # override the SQLite path
```

SQLite is the zero-config default — ideal for local development and small
single-instance deployments.

## PostgreSQL (production)

For a production / multi-instance deployment, run the server against PostgreSQL
instead of SQLite. The server library accepts a storage adapter via
`createDashboardServer({ store })`; the `PostgresStore` adapter implements the
async store interface on top of a `pg`-backed client.

```ts
import { createDashboardServer } from '@erne/monitor/dashboard/server';
import { PostgresStore } from '@erne/monitor/dashboard/server/storage/postgresStore';
import { createPoolPgClient } from '@erne/monitor/dashboard/server/storage/pgClient';

const client = await createPoolPgClient({
  connectionString: process.env.DATABASE_URL,
});

const store = new PostgresStore({ client });
await store.bootstrap(); // applies the migration set; idempotent, checksum-guarded

const handle = await createDashboardServer({ store, port: 3333 });
```

`bootstrap()` creates the bookkeeping table and applies every pending migration.
It is idempotent and refuses to run on checksum drift between the declared SQL
and what was previously applied. A readiness probe (`readyCheck()` / the
`/api/ready` endpoint) reports whether migrations are applied before you start
serving traffic.

:::note
The bundled `npx @erne/monitor dashboard` CLI command targets SQLite (its `--db`
flag is a SQLite file path). Postgres is wired programmatically with the
`createDashboardServer({ store })` API shown above — run it from a small Node
entrypoint in your deployment.
:::

## Environment variables

These are read by the server when the corresponding option isn't passed
explicitly to `createDashboardServer`:

| Variable               | Purpose                                                                                       |
| ---------------------- | --------------------------------------------------------------------------------------------- |
| `ERNE_API_KEY`         | Coarse API-key gate for `/api/*`. When set, every non-public API call must present it as `Authorization: Bearer <key>` or `?apiKey=<key>`. Unset → no edge gate (the local-dev default). |
| `MONITOR_JWT_SECRET`   | Secret used to sign / verify RBAC access tokens (JWTs). If unset, the server generates a 256-bit secret once and persists it (survives restarts). |
| `ERNE_WEBHOOK_SECRET`  | Shared HMAC secret for outbound generic `webhook:` alert deliveries. When set, each webhook POST carries an `X-ERNE-Signature: sha256=<hex>` header so receivers can verify it. |

The `/api/health` and `/api/ready` probes always bypass the API-key gate so
orchestrator health checks never fail. The SPA static assets are public too —
they render the login shell.

## RBAC (Owner / Member / Viewer)

The management surface (`/api/*`) supports multi-tenant RBAC with three roles,
highest privilege first:

- **Owner** — full administration, including user management.
- **Member** — read/write on monitoring data.
- **Viewer** — read-only.

Roles are hierarchical: an Owner satisfies Member and Viewer; a Member satisfies
Viewer.

### Auth is dormant until the first user is created

By default RBAC is **AUTO**: it is dormant (login-free) until the first user
exists. While dormant, every caller is treated as the synthetic **Owner** of the
`default` tenant — so a fresh single-tenant self-host (and local dev) needs no
login at all. Creating the first user flips RBAC into enforcing mode, after which
a JWT login is required.

This mirrors the fail-open empty-set default of ingest keys: it's opt-in, never a
surprise lockout. You can override the AUTO behaviour:

- `auth.enabled: true` — require auth even before any user exists (the first
  request 401s until you bootstrap a user).
- `auth.enabled: false` — disable RBAC entirely regardless of stored users.

### Bootstrapping and login

```bash
# While dormant, the FIRST registration bootstraps the first Owner (no token).
curl -X POST http://127.0.0.1:3333/api/auth/register \
  -H 'Content-Type: application/json' \
  -d '{ "email": "owner@example.com", "password": "..." }'

# Thereafter, exchange email + password for a JWT.
curl -X POST http://127.0.0.1:3333/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{ "email": "owner@example.com", "password": "..." }'
```

Access tokens default to a **12-hour** lifetime (tunable via `auth.tokenTtlMs`).
Passwords are never stored in plaintext — only a per-user scrypt hash + salt.
User management is Owner-only:

| Method + path                 | Action                                                  |
| ----------------------------- | ------------------------------------------------------- |
| `GET /api/auth/me`            | Identity of the current principal.                      |
| `GET /api/auth/users`         | List users in the principal's tenant (Owner).           |
| `PATCH /api/auth/users/:id`   | Change a user's role (Owner). Guards the last Owner.    |
| `DELETE /api/auth/users/:id`  | Remove a user (Owner). Guards the last Owner.           |

The server refuses to demote or remove the **last Owner** of a tenant, so you
can't lock yourself out of administration.

## Ingest keys

Shipped apps authenticate to the WebSocket ingest path with an opaque bearer
token. Because a single token is fanned out across a whole fleet, the server
supports **rotation** (issue a new token while the old one keeps working through
a grace window) and **revocation** (kill a token instantly when it leaks).

- Only the **SHA-256 hash** of each token is stored. The raw token is returned
  exactly once at creation / rotation and is unrecoverable afterwards — capture
  it then.
- A rotated-out key stays valid for a default **24-hour** grace window, long
  enough for an SDK fleet to pick up the new token via its next release / OTA.
- Revocation takes effect immediately.

Manage ingest keys from the dashboard. The empty key-set default is fail-open
(no key required) for local dev; provisioning a key turns on enforcement.

## Operational endpoints

- `GET /api/health` — liveness probe (public).
- `GET /api/ready` — readiness probe: migrations applied, store ready (public).
- `GET /metrics` — Prometheus metrics (gated by the same API key by default; set
  `metrics: { public: true }` to expose it without the key on a trusted network).
- Retention purge runs in-process by default (configurable window) so old events
  age out automatically.

## Next steps

- [MCP integration](/mcp-integration/) — point Claude at this dashboard.
- [SDK configuration](/sdk-configuration/) — what the SDK sends and how it's
  sampled / sanitized before it reaches here.
