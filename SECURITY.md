# Security Policy

ERNE takes the security of `@erne/monitor` and its self-hosted dashboard seriously. This document explains what is in scope, how to report a vulnerability privately, and what to expect from us after you do.

## Supported Versions

Security fixes are backported to the latest minor of each supported line. Older lines receive fixes only at our discretion.

| Component                  | Version | Supported          |
| -------------------------- | ------- | ------------------ |
| `@erne/monitor` (SDK)      | 0.1.x   | :white_check_mark: |
| `@erne/monitor` (SDK)      | < 0.1   | :x:                |
| Dashboard server           | 2.x     | :white_check_mark: |
| Dashboard server           | 1.x     | :x:                |

Pre-1.0 releases are still considered supported because the project is in active launch — we will publish a formal support matrix once `@erne/monitor` reaches 1.0.

## Reporting a Vulnerability

**Do not open a public GitHub issue for security vulnerabilities.** Public disclosure before a fix is available puts every user at risk.

Use one of these private channels instead:

1. **Preferred — GitHub Security Advisories.** Open a private report at
   [github.com/JubaKitiashvili/everything-react-native-expo/security/advisories/new](https://github.com/JubaKitiashvili/everything-react-native-expo/security/advisories/new).
   This keeps the report private, lets us collaborate on a fix in a temporary fork, and issues a CVE when warranted.
2. **Email.** Write to **security@erne.dev**. Encrypt sensitive details if you can; otherwise send enough to reproduce and we will follow up.

Please include, where possible:

- The affected component and version (SDK or dashboard server).
- A description of the vulnerability and its impact.
- Step-by-step reproduction, proof-of-concept, or a minimal failing project.
- Any suggested remediation.

## Coordinated Disclosure Timeline

We follow a **90-day coordinated disclosure** model:

| Day     | What happens                                                                          |
| ------- | ------------------------------------------------------------------------------------- |
| 0       | You report the issue privately.                                                       |
| 1–2     | We acknowledge receipt (target: within 48 hours).                                     |
| 3–10    | We triage, confirm, and assign a severity (CVSS-based).                               |
| ≤ 90    | We develop, test, and release a fix; we credit you in the advisory unless you prefer otherwise. |
| Post-fix| Public disclosure via GitHub Security Advisory + CVE (if applicable).                 |

If a fix is not ready within 90 days, we will coordinate a mutually agreed extension with you before any public disclosure. We ask that you keep the report private until the advisory is published.

## Scope

**In scope:**

- The `@erne/monitor` SDK (the npm package — collection, redaction, transport, storage adapters).
- The self-hosted dashboard **server** (ingest API, storage, auth).

**Out of scope:**

- Demo apps and example projects in this repository.
- The documentation site and marketing site (`erne.dev`) — report those to the email above as a courtesy, but they are not covered by the bounty program below.
- Vulnerabilities in third-party dependencies (report those upstream; we will pick up patched releases).
- Findings that require a rooted/jailbroken device, physical access, or a compromised developer machine.
- Social engineering, denial-of-service via volumetric traffic, and missing best-practice headers without a demonstrated impact.

## Bug Bounty Policy (stub)

> **Status:** A formal bounty program is not yet live. The terms below describe our planned launch-week program and will be finalized before it opens.

- **Launch-week pilot:** During the public launch week we plan to offer a **$500 gift-card** reward pool for the first valid, in-scope, high-severity reports. Exact per-report amounts and the total pool will be announced when the program opens.
- **Eligibility / fraud guards:**
  - Your GitHub account must be **at least 90 days old**.
  - Your GitHub account must have **two-factor authentication (2FA) enabled**.
  - One reward per unique root cause; duplicates are credited to the first reporter.
  - ERNE maintainers, contractors, and their immediate family are not eligible.
- Rewards are discretionary and depend on severity, report quality, and scope. Out-of-scope findings are not eligible.

## CVE & Advisory Process

We use **GitHub Security Advisories (GHSA)** as the system of record:

1. A confirmed, in-scope vulnerability gets a draft GHSA.
2. We request a **CVE ID** through GitHub's CNA integration when the issue warrants one.
3. We develop and verify the fix privately (in the advisory's temporary fork when collaborating with you).
4. We publish the patched release, then publish the advisory with the CVE, affected versions, and credit.
5. We announce the advisory in the release notes / `CHANGELOG.md`.

Thank you for helping keep ERNE and its users safe.
