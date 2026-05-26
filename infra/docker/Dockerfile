# syntax=docker/dockerfile:1.7
#
# @erne/monitor — self-hosted dashboard server image.
#
# Multi-stage build:
#   1. `app-build`    — builds the Vite/React SPA into dashboard/public.
#   2. `server-build` — compiles the TypeScript server to dist/ and copies
#                       the built SPA so the server can serve it statically.
#   3. `runtime`      — slim Node 22 image, non-root, with only production
#                       deps + the compiled server + SPA + entrypoint.
#
# The server library exports `startDashboardServer` but the in-repo CLI
# wrapper (Task 114) is not published into this package yet, so this image
# ships a tiny ESM entrypoint (server/docker-entrypoint.mjs, generated below)
# that reads container-friendly env (HOST=0.0.0.0, PORT) and boots the server.
#
# Build context MUST be the repo root:
#   docker build -f infra/docker/Dockerfile -t erne-monitor:local .

# ---------------------------------------------------------------------------
# Stage 1 — build the SPA (dashboard/app → dashboard/public)
# ---------------------------------------------------------------------------
FROM node:22-bookworm-slim AS app-build
WORKDIR /build

# Copy the workspace manifests first for better layer caching.
COPY packages/monitor/dashboard/app/package.json packages/monitor/dashboard/app/package-lock.json* ./dashboard/app/
WORKDIR /build/dashboard/app
RUN npm install --no-audit --no-fund

# Copy the rest of the SPA source and build into ../public.
COPY packages/monitor/dashboard/app/ ./
COPY packages/monitor/dashboard/public/ /build/dashboard/public/
RUN npm run build

# ---------------------------------------------------------------------------
# Stage 2 — compile the server (TypeScript → dist/)
# ---------------------------------------------------------------------------
FROM node:22-bookworm-slim AS server-build
WORKDIR /build/server

# better-sqlite3 is a native module — its prebuilt binaries usually download,
# but provide the toolchain in case a source build is triggered.
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

COPY packages/monitor/dashboard/server/package.json packages/monitor/dashboard/server/package-lock.json* ./
# Include optional deps (pg, ioredis) so Postgres/Redis profiles work.
RUN npm install --no-audit --no-fund --include=optional

COPY packages/monitor/dashboard/server/ ./
RUN npm run build

# Bring in the SPA the server serves from ../public.
COPY --from=app-build /build/dashboard/public/ /build/public/

# ---------------------------------------------------------------------------
# Stage 3 — runtime (slim, non-root, production deps only)
# ---------------------------------------------------------------------------
FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3333 \
    ERNE_DATA_DIR=/data \
    ERNE_DB_PATH=/data/dashboard.db
WORKDIR /app/server

# Production-only deps (include optional so pg/ioredis are available when the
# operator sets DATABASE_URL / REDIS_URL). Toolchain available for any native
# rebuild of better-sqlite3, then removed to keep the image slim.
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

COPY packages/monitor/dashboard/server/package.json packages/monitor/dashboard/server/package-lock.json* ./
RUN npm install --omit=dev --include=optional --no-audit --no-fund \
  && npm cache clean --force \
  && apt-get purge -y python3 make g++ || true

# Compiled server + SPA from the build stages.
COPY --from=server-build /build/server/dist/ ./dist/
COPY --from=server-build /build/public/ /app/public/

# Container entrypoint: wires env → startDashboardServer, binds 0.0.0.0,
# resolves the SQLite path under the mounted volume, and handles SIGTERM.
COPY infra/docker/docker-entrypoint.mjs ./docker-entrypoint.mjs

# Persist the SQLite database (and any future on-disk state) on a volume.
# The data dir is created and chowned for the non-root `node` user.
RUN mkdir -p /data && chown -R node:node /data /app
VOLUME ["/data"]

USER node
EXPOSE 3333

# Liveness probe — hits the un-gated /api/health endpoint. Uses Node's global
# fetch (Node 18+) so no curl is required in the image.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3333)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["node", "docker-entrypoint.mjs"]
