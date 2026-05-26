# ERNE Monitor — Self-Host Infrastructure

Deploy descriptors for the self-hosted **`@erne/monitor`** dashboard — the
Node HTTP + WebSocket server that ingests telemetry on `/ws/ingest`, serves the
built SPA, and exposes `/api/*`, `/metrics`, `/api/health`, and `/api/ready`.

| File / dir                 | Target                                            |
| -------------------------- | ------------------------------------------------- |
| `docker/Dockerfile`        | Multi-stage Node 22 image (server + SPA)          |
| `docker/docker-entrypoint.mjs` | Container boot shim (env → `startDashboardServer`) |
| `docker-compose.yml`       | Local / single-host (SQLite, optional PG + Redis) |
| `helm/erne/`               | Kubernetes (Helm chart)                           |
| `railway.json`             | Railway one-click deploy                          |
| `render.yaml`              | Render Blueprint                                  |
| `cloudformation/erne.yaml` | AWS ECS Fargate + EFS                             |

All deploys build from `docker/Dockerfile`. **The build context is the repo
root** (the Dockerfile reaches into `packages/monitor/dashboard/`).

---

## Quick start

### Docker Compose (SQLite-only, the default)

```bash
docker compose -f infra/docker-compose.yml up -d --build
# dashboard on http://localhost:3333
```

Add optional backends via compose profiles (off by default):

```bash
# Postgres (reserved — see "Postgres status" below):
docker compose -f infra/docker-compose.yml --profile postgres up -d

# Redis read-cache:
docker compose -f infra/docker-compose.yml --profile redis up -d
```

### Build & run the image directly

```bash
docker build -f infra/docker/Dockerfile -t erne-monitor:local .
docker run -p 3333:3333 -v erne-data:/data erne-monitor:local
```

### Helm

```bash
helm install erne ./infra/helm/erne \
  --set image.repository=ghcr.io/your-org/erne-monitor \
  --set image.tag=0.1.0 \
  --set secret.erneApiKey=$(openssl rand -hex 24) \
  --set ingress.enabled=true \
  --set ingress.hosts[0].host=monitor.example.com
```

Lint / render before applying:

```bash
helm lint ./infra/helm/erne
helm template erne ./infra/helm/erne | kubectl apply --dry-run=client -f -
```

### Railway

Point Railway at the repo. It reads `infra/railway.json` (Dockerfile builder).
Set the env vars below in the Railway dashboard and add a volume mounted at
`/data` for SQLite durability.

### Render

Use `infra/render.yaml` as a Blueprint. It provisions a Docker web service with
a 1 GB persistent disk at `/data`. Set `ERNE_API_KEY` / `ERNE_WEBHOOK_SECRET` in
the Render UI (marked `sync: false`).

### AWS (CloudFormation)

```bash
# 1. Build & push the image to ECR.
aws ecr create-repository --repository-name erne-monitor
docker build -f infra/docker/Dockerfile -t erne-monitor:latest .
# (tag + push to the ECR URI)

# 2. Deploy the stack.
aws cloudformation deploy \
  --template-file infra/cloudformation/erne.yaml \
  --stack-name erne-monitor \
  --capabilities CAPABILITY_IAM \
  --parameter-overrides \
    ImageUri=<acct>.dkr.ecr.<region>.amazonaws.com/erne-monitor:latest \
    VpcId=vpc-xxxx \
    PublicSubnetIds=subnet-aaa,subnet-bbb \
    ApiKey=$(openssl rand -hex 24)
```

The stack runs one Fargate task with an encrypted EFS volume for the SQLite
file, fronted by an ALB. Output `DashboardUrl` is the public URL. For higher
load, switch to RDS for PostgreSQL (see below).

---

## Environment variable reference

| Variable              | Default            | Purpose                                                                 |
| --------------------- | ------------------ | ----------------------------------------------------------------------- |
| `HOST`                | `0.0.0.0`          | Bind address. Containers must bind `0.0.0.0` (library default is `127.0.0.1`). |
| `PORT`                | `3333`             | HTTP/WS listen port.                                                    |
| `ERNE_DB_PATH`        | `/data/dashboard.db` | SQLite file path. Put it on the persistent volume.                    |
| `ERNE_API_KEY`        | _(unset)_          | Gates `/api/*` and `/metrics`. Unset → no auth (local/trusted only).    |
| `ERNE_WEBHOOK_SECRET` | _(unset)_          | HMAC secret for **outbound** alert webhooks (`X-ERNE-Signature: sha256=…`). |
| `ERNE_METRICS_PUBLIC` | `false`            | `true` → serve `/metrics` without the API key (for in-network scrapers). |
| `REDIS_URL`           | _(unset)_          | `ioredis` connection string. Enables the hot-path read-cache.           |
| `DATABASE_URL`        | _(unset)_          | Postgres DSN. **Reserved** — see "Postgres status".                     |

Client-side variables `ERNE_DASHBOARD_URL` and `ERNE_API_KEY` are consumed by
the **`@erne/monitor` SDK in the app** (where to send telemetry + the ingest
key) — they are not server-side config and are listed here only so operators
know the ingest key must match the dashboard's `ERNE_API_KEY`.

### Public, ungated endpoints

`/api/health` (liveness) and `/api/ready` (readiness) always bypass the API-key
gate so orchestrators never get stuck in a 401 restart loop. All probes in
these descriptors point at those two paths.

---

## Sizing — SQLite vs Postgres

From the project risk register:

> **≤ ~20 concurrent dashboard users → SQLite is fine.** Beyond that, move to
> Postgres.

- **SQLite** (default): single-file, single-writer, zero extra infrastructure.
  Durable as long as `ERNE_DB_PATH` lives on a persistent volume (Docker
  volume, k8s PVC, EFS, Render/Railway disk). **Run exactly one replica/task** —
  multiple writers against one SQLite file (e.g. across pods on a shared RWO
  PVC, or two Fargate tasks on one EFS file) risks corruption. The Helm chart
  uses `strategy: Recreate` and the CFN service keeps `DesiredCount=1` for this
  reason.
- **Postgres**: required for horizontal scaling / many concurrent users. Use a
  managed instance (RDS, Cloud SQL, Railway/Render Postgres) and set
  `DATABASE_URL`.

### Postgres status (important)

A `PostgresStore` exists in the server package, but it implements the **async**
store interface (`IMonitorStoreAsync`) and is **not yet wired into the
synchronous HTTP server** in this build. Today, setting `DATABASE_URL`:

- logs a warning from the entrypoint, and
- **falls back to SQLite.**

`DATABASE_URL` is threaded through every descriptor (compose, Helm secret, CFN
param, Render env) so that when the async store lands, enabling Postgres is a
config change only — no image, chart, or template edits. The `--profile
postgres` compose service and the `redis` cache (which **is** wired today) are
provided on that basis.

---

## What the maintainer must verify

- **Image registry**: no public image is published. Build from
  `docker/Dockerfile` and push to your registry; set `image.repository`/`tag`
  (Helm), `ImageUri` (CFN). Railway/Render/Compose build from source.
- **Secrets**: `ERNE_API_KEY` and `ERNE_WEBHOOK_SECRET` are unset by default
  (no auth). Set them in production. Helm renders them into a `Secret` (or use
  `secret.existingSecret`); CFN takes `NoEcho` params; Render marks them
  `sync: false`.
- **`better-sqlite3` native build**: the Dockerfile installs a build toolchain
  in case the prebuilt binary isn't available for the base image's
  glibc/arch — verify the image builds on your target architecture (notably
  arm64).
- **Entrypoint shim**: `docker-entrypoint.mjs` is a stand-in until the
  published `npx erne-universal dashboard` CLI (Task 114) is bundled into this
  package. When it ships, the `ENTRYPOINT` can switch to the CLI and the shim
  removed.
- **Postgres wiring**: confirm the async-store integration has landed before
  relying on `DATABASE_URL` in production.
