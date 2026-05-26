# ERNE Monitor Roadmap

This is a high-level, honest view of where `@erne/monitor` is heading. It is intentionally **not** a dated commitment — open-source timelines move, and we would rather under-promise. Use it to understand direction and to figure out where your input lands.

## Milestone Structure

We organize work into four sequential milestones. Each builds on the last.

1. **Foundation** — The core SDK: collectors (performance, network, errors, ANR), redaction, batching/transport, storage adapters, and the self-hosted dashboard server. This is the table-stakes layer that makes runtime monitoring work at all.
2. **Intelligence** — Analysis on top of the raw signal: latency histograms/CDFs, error-tap frustration scoring, ANR inspection, session replay, and AI-assisted triage. The goal is "tell me what's wrong," not just "here's the data."
3. **Enterprise / OTel** — Interoperability and scale: OpenTelemetry export, pluggable backends (Postgres and beyond), retention/sampling policy, RBAC, and multi-project workspaces.
4. **Launch** — Hardening, docs, benchmarks, packaging, and the public release of `@erne/monitor` to npm with a stable API surface.

## Current Status

- ✅ **SDK v1 shipped** — the Foundation collectors, redaction, transport, and storage adapters are in place.
- ✅ **Dashboard v2 shipped** — multi-page inspector with latency charts, ANR inspector, and the error-taps frustration panel.
- 🚧 **Phase 7 (Launch) in progress** — benchmark suite, packaging, license/security hardening, and release automation are actively being built. (This roadmap, the security policy, and the changeset automation are part of that work.)

## Near-Term Bucket

Things we are actively working toward as part of finishing Launch and rounding out Intelligence:

- Public npm release of `@erne/monitor` with a documented, stable API surface.
- Release automation (Changesets) and a license-audit CI gate.
- Benchmark suite results published and tracked over time.
- Tightened redaction defaults and a documented privacy posture.
- Storage adapter parity (in-memory, file, Postgres) and a documented adapter contract.

## Later Bucket

Bigger bets that come after the launch settles. These are directions, not promises:

- **OpenTelemetry export** — emit traces/metrics/logs in OTel format so ERNE plugs into existing observability stacks.
- **Additional backends** — first-class adapters beyond Postgres (e.g., ClickHouse / object storage for replay).
- **Smarter triage** — AI-assisted root-cause grouping and regression detection across releases.
- **Sampling & retention policy** — configurable, cost-aware data lifecycle.
- **Multi-project / RBAC** — workspaces, roles, and access control for teams.
- **Hosted option** — an optional managed dashboard for teams that do not want to self-host.

## How to Influence the Roadmap

This roadmap is shaped by what users actually need. Concretely:

- **Discuss ideas** in [GitHub Discussions](https://github.com/JubaKitiashvili/everything-react-native-expo/discussions) — the best place for "should ERNE do X?" and "how do you all handle Y?" conversations.
- **Request a feature** via the [Feature Request issue template](https://github.com/JubaKitiashvili/everything-react-native-expo/issues/new?template=feature_request.md). Concrete, specific requests with a clear problem statement carry the most weight.
- **Upvote** — 👍 reactions on issues and discussions are how we gauge demand. We weigh them when ordering the buckets above.
- **Report bugs** via the [Bug Report template](https://github.com/JubaKitiashvili/everything-react-native-expo/issues/new?template=bug_report.md). Reliability work always jumps the queue.

We re-read the buckets periodically and move items between Near-Term and Later based on demand and effort. If something you need is missing, open a discussion — the absence usually means we haven't heard the use case yet.

## GitHub Projects (manual setup)

> **Maintainer note:** The buckets above are mirrored in a GitHub Projects board for live tracking. This board must be created manually — it is not provisioned by any workflow in this repo.
>
> Suggested setup:
> 1. Create a repository (or org) Project named **"ERNE Monitor Roadmap."**
> 2. Add columns matching the milestones: **Foundation**, **Intelligence**, **Enterprise / OTel**, **Launch** (plus a **Done** column).
> 3. Add status fields (`status/*`) and a priority field that mirror `.github/TRIAGE.md`.
> 4. Enable the built-in "Item added to project" / "Item closed" workflows so issues flow in and out automatically.
> 5. Link the board from this file and from the repo's README once it is public.
