# Data Processing Agreement (DPA) — template + subprocessor list

> **This is a template, not legal advice, and not a binding agreement.** It is a
> drafting aid that shows the shape a DPA for ERNE Monitor managed hosting would
> take. It has **not** been reviewed by counsel, creates **no obligations**, and
> is **not in force** unless and until a signed agreement is executed between the
> named parties. Bracketed `[placeholders]` and `TODO` markers indicate
> everything that is undecided — do not treat any of it as a commitment. Consult
> qualified legal counsel before relying on or executing any data processing
> agreement.

---

## When a DPA applies — and when it doesn't

Whether you need a DPA with ERNE depends entirely on **who runs the backend**.
The product is the same in either case (see [Pricing](./pricing.md) — OSS and
Cloud have full feature parity); only the operating model differs.

### Self-hosted (OSS) — no DPA needed, **no subprocessors**

When you run `@erne/monitor` self-hosted — your own dashboard server, or
local-only mode with no backend at all — **your telemetry never reaches ERNE or
any third party we engage.** The SDK runs inside your app, on your users'
devices; events flow only to infrastructure **you** operate (or stay on-device).

In this mode:

- **ERNE is not a data processor for your telemetry.** We never receive, store,
  or process it. There is nothing for us to be a processor _of_.
- **There are no subprocessors.** We engage no third party to handle your data,
  because no data flows to us. See the [subprocessor list](#subprocessor-list)
  below — for self-hosted, the honest answer is _"None — you host it."_
- **A DPA with ERNE is typically unnecessary**, since the legal relationship a
  DPA governs (controller → processor) does not exist. You remain the controller
  and, where applicable, your **own** processor; your DPAs are with _your_
  hosting/cloud vendors, not with us.

This is a deliberate design choice and one of the main reasons to self-host: it
removes ERNE from your data-flow and your compliance perimeter entirely. ERNE
Monitor is **self-hosted-by-default and shipping today** — see
[Getting Started](./getting-started.md).

> **When a DPA can still help even if you self-host.** A DPA is about the
> _processing relationship_, not the software license, so a couple of edge cases
> remain:
>
> - If you optionally enable the **AI Fix PR agent / MCP** features that send
>   data to a third-party model provider, _that provider_ may be your processor —
>   you would look to a DPA with **them**, not with ERNE. (These features are
>   off unless you configure them; review what they transmit before enabling.)
> - If you engage ERNE for paid **support, professional services, or custom
>   work** under which we might incidentally access your telemetry, a narrow DPA
>   covering that specific access can be appropriate. That is separate from the
>   self-hosted product itself.

### Managed Cloud / Enterprise — DPA + subprocessor list **do** apply

When ERNE (or the operating entity) **hosts the backend for you** — the planned,
not-yet-GA **ERNE Cloud** and the Enterprise add-ons that sit on top of it — your
telemetry is transmitted to and processed by infrastructure **we** operate. In
that model:

- **ERNE acts as a processor** (you remain the controller of your end-users'
  personal data).
- **A DPA applies**, and a **subprocessor list** must be published and kept
  current.

ERNE Cloud and Enterprise are **on the roadmap, not generally available** (per
[Pricing](./pricing.md) and
[Self-hosted → ERNE Cloud](./migration/oss-to-cloud.md)). The template below is
therefore the **draft that would govern managed hosting once it ships** — every
operational specific (legal entity, hosting regions, subprocessors, retention
windows, breach-notification timing) is an open `TODO` until Cloud reaches GA.

---

## DPA template

> Reminder: template only — see the [disclaimer](#data-processing-agreement-dpa--template--subprocessor-list)
> at the top. Replace every `[placeholder]` and resolve every `TODO` with
> counsel before use.

This Data Processing Agreement (the "**DPA**") supplements and forms part of the
agreement between the parties for the provision of ERNE Monitor managed hosting
(the "**Services**"). In the event of a conflict between this DPA and that
agreement on the subject of data protection, this DPA controls.

### 1. Parties and roles

| Role           | Party                                                                                            | Description                                                                                  |
| -------------- | ------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| **Controller** | `[Customer Legal Name]`, `[Customer Address]`                                                    | Determines the purposes and means of the processing of Personal Data.                        |
| **Processor**  | `[ERNE Operating Entity Legal Name]`, `[Address]` — `TODO: confirm operating entity at Cloud GA` | Processes Personal Data on behalf of, and on the documented instructions of, the Controller. |

- **Effective Date:** `[Effective Date]`
- Where the Controller is itself acting as a processor for a third party, the
  Controller warrants it has authority to engage `[ERNE Operating Entity]` as a
  subprocessor and to give the instructions in this DPA.
- Defined terms not otherwise defined here (e.g. "Personal Data", "Data
  Subject", "Processing", "Supervisory Authority") have the meaning given under
  `[Applicable Data Protection Law — e.g. EU/UK GDPR, CCPA/CPRA]`.

### 2. Subject-matter and duration of processing

- **Subject-matter:** processing of Personal Data contained in runtime telemetry
  (crash, performance, session, and related diagnostic events) that the
  Controller's application transmits to the Services.
- **Duration:** for the term of the underlying agreement and any period during
  which `[ERNE Operating Entity]` retains Personal Data thereafter, subject to
  Section 12 (return/deletion) and the agreed retention window
  (`TODO: retention window TBD` — see [Pricing](./pricing.md) tier matrix).

### 3. Nature and purpose of processing

- **Nature:** collection, receipt, storage, organization, structuring,
  aggregation (e.g. crash grouping), querying, and erasure of telemetry events,
  carried out to operate the managed dashboard, alerting, and AI-assisted
  diagnosis features.
- **Purpose:** to provide the Services — i.e. to host, store, display, and help
  the Controller analyze its own application telemetry — and for no other
  purpose. `[ERNE Operating Entity]` will not use Personal Data for its own
  purposes, including model training, except `[None / TODO: specify exactly if
any, with opt-in — do not assume any such use exists]`.

### 4. Categories of data subjects and personal data

> The Controller controls what its app transmits. `@erne/monitor` ships a
> per-category **consent gate** and a **PII sanitizer** (email / phone / auth
> headers / URLs) and a session-replay **masker** to minimize personal data at
> source — see the [package README](../packages/monitor/README.md). The lists
> below describe what _may_ be present depending on the Controller's
> configuration.

| Categories of data subjects                          |
| ---------------------------------------------------- |
| End users of the Controller's mobile/web application |
| `[Other — TODO: specify if applicable]`              |

| Categories of personal data (configuration-dependent)                                      |
| ------------------------------------------------------------------------------------------ |
| Opaque/pseudonymous user identifier set via `setUserId` (see Section 8)                    |
| Device, OS, and app-version metadata; diagnostic / crash / performance telemetry           |
| Network metadata in events (URLs/headers, **subject to the built-in PII sanitizer**)       |
| Session-replay screenshots (**PII-masked**, opt-in via consent — replay is off by default) |
| `[Any other fields the Controller chooses to attach to events — TODO]`                     |

- **Special categories** of data (Art. 9 GDPR) `[are not intended to be
processed / TODO]`. The Controller is responsible for not transmitting special
  category data into telemetry unless expressly agreed in writing.

### 5. Controller instructions

- `[ERNE Operating Entity]` processes Personal Data only on the Controller's
  **documented instructions**, including this DPA and the configuration the
  Controller sets in the Services, unless required to act by applicable law (in
  which case it informs the Controller first, unless that law prohibits it on
  important grounds of public interest).
- `[ERNE Operating Entity]` will inform the Controller if, in its opinion, an
  instruction infringes applicable data protection law.

### 6. Confidentiality

- `[ERNE Operating Entity]` ensures that persons authorized to process the
  Personal Data are bound by an appropriate obligation of confidentiality
  (contractual or statutory) and process the data only as instructed.

### 7. Security measures

- `[ERNE Operating Entity]` implements appropriate technical and organizational
  measures to ensure a level of security appropriate to the risk, taking into
  account the state of the art and the nature of the data.
- **`TODO: enumerate the specific security measures at Cloud GA`** (e.g.
  encryption in transit and at rest, access controls and least privilege,
  network segmentation, logging/monitoring, vulnerability management, backup and
  restore — to be specified, not assumed). No specific certification (e.g. SOC 2)
  is represented here; see [Pricing](./pricing.md) — compliance attestations are
  `TODO` and "not promised until verified".
- The product side already provides relevant building blocks the Controller can
  rely on: offline-first **gzipped batch transport**, the **PII sanitizer**, the
  session-replay **masker**, and the **per-category consent gate** (see the
  [package README](../packages/monitor/README.md)).

### 8. Data subject rights — assistance

- Taking into account the nature of the processing, `[ERNE Operating Entity]`
  assists the Controller by appropriate technical and organizational measures, so
  far as possible, in fulfilling the Controller's obligation to respond to Data
  Subject requests (access, rectification, erasure, restriction, portability,
  objection).
- **This assistance is grounded in shipping product capability.** `@erne/monitor`
  exposes a **DSAR API** to tag events with an opaque user id and then export or
  delete that user's data on request:

  ```tsx
  monitor?.setUserId('user-42'); // tag subsequent events
  monitor?.exportUserData('user-42'); // satisfy an access / portability request
  monitor?.deleteUserData('user-42'); // satisfy an erasure / revoke request
  ```

  See the **DSAR API (GDPR)** section of the
  [package README](../packages/monitor/README.md). A managed Cloud would expose
  equivalent export/delete operations against the hosted store; the broader
  backend-level export uses the portable
  [data-export format](./migration/data-export-format.md).

- `TODO: define the operational SLA for DSAR assistance (response time, channel)
at Cloud GA.`

### 9. Subprocessing

- The Controller provides a **general authorization** for `[ERNE Operating
Entity]` to engage subprocessors, subject to this Section. The current
  subprocessors are listed in the [subprocessor list](#subprocessor-list) below.
- `[ERNE Operating Entity]` imposes data protection obligations on each
  subprocessor that are **no less protective** than those in this DPA, and
  remains liable for its subprocessors' performance.
- `[ERNE Operating Entity]` notifies the Controller of intended **additions or
  replacements** of subprocessors at least `[N]` days in advance
  (`TODO: notice period TBD`), giving the Controller the opportunity to object on
  reasonable data-protection grounds.
- **For self-hosted deployments there are no subprocessors** (no data reaches
  `[ERNE Operating Entity]`); this Section is operative only for managed hosting.

### 10. International transfers

- Where processing involves a transfer of Personal Data to a country without an
  adequacy decision, the parties rely on an appropriate transfer mechanism
  (e.g. the EU **Standard Contractual Clauses** / UK **IDTA / Addendum**),
  incorporated by reference and completed as `[Module / version — TODO]`.
- Hosting regions and any data-residency commitments are
  `TODO: regions / residency TBD` (see [Pricing](./pricing.md)).

### 11. Personal data breach notification

- `[ERNE Operating Entity]` notifies the Controller **without undue delay** after
  becoming aware of a Personal Data Breach affecting the Controller's Personal
  Data, and within `[N hours]` (`TODO: breach-notification window TBD`).
- The notification includes, to the extent known, the nature of the breach,
  categories and approximate number of data subjects and records affected, likely
  consequences, and measures taken or proposed. `[ERNE Operating Entity]`
  cooperates with the Controller's own breach-notification obligations to
  Supervisory Authorities and data subjects.

### 12. Audit rights

- `[ERNE Operating Entity]` makes available to the Controller information
  reasonably necessary to demonstrate compliance with this DPA and allows for and
  contributes to audits, including inspections, conducted by the Controller or an
  auditor it mandates.
- **Mechanics `TODO`:** frequency, notice period, scope, confidentiality, cost
  allocation, and whether third-party reports/certifications may substitute for
  on-site audits are to be specified at Cloud GA (no certification is represented
  today — see [Pricing](./pricing.md)).

### 13. Return and deletion on termination

- On expiry or termination of the Services, and at the Controller's choice,
  `[ERNE Operating Entity]` **returns** the Personal Data (via the portable
  [data-export format](./migration/data-export-format.md)) and **deletes**
  existing copies, unless retention is required by applicable law.
- `TODO: define the return/deletion window and any legally required retention at
Cloud GA.`

### 14. Governing law

- This DPA is governed by `[Governing Law]` and subject to the jurisdiction of
  the courts of `[Jurisdiction]`, without prejudice to the data subjects' and
  Supervisory Authorities' rights under applicable data protection law.

### 15. Order of precedence

- This DPA supplements the underlying agreement. Where they conflict on data
  protection, this DPA prevails; where any incorporated transfer clauses (e.g.
  SCCs) conflict with this DPA, those clauses prevail to the extent of the
  conflict.

---

## Subprocessor list

A subprocessor is a third party engaged by the processor to process Personal
Data on the Controller's behalf.

### Self-hosted (OSS)

**None — you host it.** No data reaches ERNE or any third party we engage, so
there are no subprocessors. (This is the default and shipping mode; see
[when a DPA applies](#when-a-dpa-applies--and-when-it-doesnt).)

| Subprocessor                                 | Purpose | Location |
| -------------------------------------------- | ------- | -------- |
| _None_ — your data never leaves your control | —       | —        |

### Managed Cloud / Enterprise _(roadmap — not yet GA)_

The hosted service is not generally available, so its subprocessors are not yet
determined or published. **No vendors or locations are listed here because none
have been decided** — populate this table when ERNE Cloud launches, and notify
Controllers of changes per Section 9.

| Subprocessor                                | Purpose                                  | Location                                    |
| ------------------------------------------- | ---------------------------------------- | ------------------------------------------- |
| `TODO: to be published when Cloud launches` | `TODO: e.g. infrastructure hosting`      | `TODO: to be published when Cloud launches` |
| `TODO: to be published when Cloud launches` | `TODO: e.g. transactional notifications` | `TODO: to be published when Cloud launches` |
| `TODO: to be published when Cloud launches` | `TODO: e.g. error/log aggregation`       | `TODO: to be published when Cloud launches` |

> Optional, Controller-enabled AI features (AI Fix PR agent / MCP) may transmit
> data to a **third-party model provider of the Controller's choosing**. Such a
> provider is the Controller's processor under the Controller's own DPA with that
> provider, not an ERNE subprocessor — it is therefore not listed above.

---

## Related documentation

- **[Pricing](./pricing.md)** — OSS vs Cloud vs Enterprise; why the DPA and
  subprocessor list are an Enterprise/Cloud concern, with all operational
  specifics marked `TODO`.
- **[Getting Started](./getting-started.md)** — wire up the self-hosted SDK and
  dashboard (the no-DPA-needed default).
- **[`@erne/monitor` package README](../packages/monitor/README.md)** — the
  authoritative source for the **DSAR API (GDPR)**, the per-category consent gate,
  the PII sanitizer, and local-only mode.
- **[Portable data-export format](./migration/data-export-format.md)** — the
  backup/interchange format used for data return on termination and for backend
  export.
- **[Self-hosted → ERNE Cloud](./migration/oss-to-cloud.md)** — the (roadmap)
  migration path into managed hosting that would bring a DPA into scope.
- **[Tool comparisons](./compare/README.md)** — where ERNE's self-hosted /
  data-ownership model sits against alternatives.
- **[LICENSE](../LICENSE)** — the MIT license covering the product itself
  (separate from any hosted-service terms).

---

> **Final reminder.** Nothing on this page is legal advice or a binding
> commitment. The template is provided to speed up drafting with counsel; the
> subprocessor list for managed hosting is intentionally empty pending decisions.
> The one firm statement here is the factual one: **for self-hosted ERNE, there
> are no subprocessors and your data never reaches us.**
