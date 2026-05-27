# Independent Contractor Agreement — template

> **This is a template, not legal advice, and not a binding agreement.** It is a
> drafting aid that shows the shape an independent-contractor agreement for work
> on ERNE could take. It has **not** been reviewed by counsel, creates **no
> obligations**, and is **not in force** unless and until a signed agreement is
> executed by **both** named parties. Bracketed `[Placeholders]` and `TODO`
> markers indicate everything that is undecided — do not treat any of it as a
> commitment, an offer, or an executed contract. Consult qualified legal counsel
> before relying on or executing any contractor agreement.

---

## How to use this template

Replace every `[Placeholder]` and resolve every `TODO` with counsel before use.
None of the values below are filled in on purpose — the legal entity, the
contractor, rates, dates, jurisdiction, and notice periods are all open until a
real engagement is negotiated.

A note on context: ERNE (`@erne/monitor` and the surrounding tooling) is an
**open-core** project — the product itself is MIT-licensed (see
[LICENSE](../../LICENSE)), and "the core is the whole thing" per
[Pricing](../pricing.md). That license posture shapes the IP and open-source
terms in Section 3 below: contributions to the open codebase are expected to be
made under the **project's existing license**, distinct from any
Company-confidential or non-public work product. Decide per engagement which
bucket a given deliverable falls into.

---

## Agreement template

> Reminder: template only — see the [disclaimer](#independent-contractor-agreement--template)
> at the top. Not binding until executed by both parties.

This Independent Contractor Agreement (the "**Agreement**") is entered into as of
the Effective Date by and between the parties identified below.

### 1. Parties and effective date

| Role           | Party                                             |
| -------------- | ------------------------------------------------- |
| **Company**    | `[Company Legal Name]`, `[Company Address]`       |
| **Contractor** | `[Contractor Legal Name]`, `[Contractor Address]` |

- **Effective Date:** `[Effective Date]`
- The Company and the Contractor are each a "**Party**" and together the
  "**Parties**." This Agreement governs the engagement described in Section 2 and
  any Statement of Work the Parties may execute under it.

### 2. Scope of work and deliverables

- **Scope of work:** the Contractor will provide the services described in
  `[Description of Work]` (the "**Services**"), as further detailed in any
  attached or subsequently executed Statement of Work (each, an "**SOW**").
- **Deliverables:** the tangible and intangible outputs the Contractor is engaged
  to produce — `[Description of Deliverables]` (the "**Deliverables**").
- **Timeline / milestones:** `[Timeline / Milestones — TODO]`.
- The Contractor will perform the Services with reasonable skill and care and in
  accordance with any reasonable instructions and standards the Company provides.
  Where the work touches the ERNE codebase, the Contractor will follow the
  project's contribution and coding standards (`TODO: link the contributing guide
/ standards in effect at the time of engagement`).
- Each SOW may specify its own scope, deliverables, fees, and timeline; in the
  event of a conflict, the SOW controls for that engagement, and this Agreement
  controls on all other matters.

### 3. Intellectual property

- **Assignment of work product.** Subject to the carve-out below, the Contractor
  **assigns to the Company** all right, title, and interest in and to the
  Deliverables and all other work product, inventions, and intellectual property
  created by the Contractor **specifically for the Company** in the course of
  performing the Services ("**Work Product**"), including all copyrights, patent
  rights, trade secrets, and other intellectual-property rights therein. The
  Contractor will execute documents and take reasonable actions the Company
  requests to perfect and record that assignment.
- **Pre-existing IP carve-out.** The Contractor retains ownership of intellectual
  property the Contractor owned or developed **before** the engagement, or
  **independently of and outside** the Services (collectively, "**Pre-existing
  IP**"). To the extent any Pre-existing IP is incorporated into a Deliverable,
  the Contractor grants the Company a **non-exclusive, perpetual, irrevocable,
  worldwide, royalty-free** license to use, modify, and distribute that
  Pre-existing IP **as part of the Deliverable**. The Contractor should identify
  any Pre-existing IP it intends to incorporate in `[Schedule of Pre-existing IP —
TODO]`.
- **Moral rights.** To the extent permitted by applicable law, the Contractor
  **waives** (or agrees not to assert) any moral rights in the Work Product in
  favor of the Company and its assignees. Where such rights cannot be waived, the
  Contractor consents to the Company's use of the Work Product consistent with
  this Agreement.
- **Open-source contributions.** Where the Contractor contributes to ERNE's
  **public, open-source codebase**, those contributions are made **under the
  project's existing open-source license** — ERNE is **MIT-licensed** (see
  [LICENSE](../../LICENSE)) — and are governed by that license and the project's
  contribution terms, **not** by the assignment in this Section. The Parties
  should agree per SOW which Deliverables are open-source contributions (under the
  project license) and which are Company-confidential or non-public Work Product
  (assigned under this Section). `TODO: confirm the project license and any
contributor-license / DCO requirements in effect at the time of engagement.`

### 4. Confidentiality

- **Definition.** "**Confidential Information**" means non-public information the
  Company discloses to the Contractor, or that the Contractor learns in connection
  with the Services, that is marked or reasonably understood to be confidential —
  including non-public source code, designs, roadmaps, business and financial
  information, customer and user data, and trade secrets.
- **Obligations.** The Contractor will (a) use Confidential Information **only** to
  perform the Services, (b) **not disclose** it to any third party without the
  Company's prior written consent, and (c) protect it using at least the same
  degree of care it uses for its own confidential information of like importance
  (and no less than reasonable care).
- **Duration.** These obligations survive termination of this Agreement and
  continue for `[N years]` thereafter (`TODO: duration TBD`), and **indefinitely**
  for information that constitutes a trade secret for as long as it remains a
  trade secret under applicable law.
- **Return / destruction.** On termination, or earlier on the Company's request,
  the Contractor will **return or destroy** all Confidential Information and
  copies in its possession or control, and certify destruction in writing if the
  Company asks.
- **Carve-outs.** Confidential Information does **not** include information that
  (a) is or becomes **public** through no fault of the Contractor, (b) the
  Contractor **independently developed** without use of or reference to the
  Confidential Information, (c) the Contractor lawfully obtained from a third party
  without a duty of confidentiality, or (d) is required to be disclosed by law or
  court order (in which case the Contractor will, where permitted, give the Company
  prompt notice and reasonable cooperation to seek protective treatment).

### 5. Payment terms

- **Compensation.** The Company will pay the Contractor `[Rate / Fixed Fee]` for
  the Services (e.g. `[hourly rate]` per hour, or a `[fixed project fee]`, or as
  set out in the applicable SOW).
- **Currency.** All amounts are stated and payable in `[Currency]`.
- **Invoicing cadence.** The Contractor will invoice the Company `[Invoicing
Cadence — e.g. monthly / on milestone completion]`.
- **Payment window.** The Company will pay undisputed invoices within `[Net-N]`
  days of receipt. The Company will notify the Contractor of any good-faith dispute
  within `[N]` days and pay the undisputed portion on schedule.
- **Expenses.** The Company will reimburse pre-approved, reasonable, documented
  expenses the Contractor incurs in performing the Services; all expenses require
  the Company's prior written approval and supporting receipts. `TODO: define the
expense-approval process and any caps.`
- **Taxes.** Amounts are exclusive of taxes; the Contractor is responsible for its
  own taxes as described in Section 6.

### 6. Independent-contractor status

- **No employment.** The Contractor is an **independent contractor**, not an
  employee, partner, agent, or joint venturer of the Company. Nothing in this
  Agreement creates an employment relationship.
- **Taxes and benefits.** The Contractor is **solely responsible** for its own
  income, self-employment, and other taxes, and is **not entitled** to any
  employee benefits (insurance, retirement, paid leave, or similar). The Company
  will not withhold taxes on the Contractor's behalf except where required by law.
- **Control of work.** The Contractor controls the **manner and means** of
  performing the Services, subject to the Deliverables, timelines, and reasonable
  standards in this Agreement and any SOW. The Contractor supplies its own tools
  and equipment unless otherwise agreed.
- **No authority to bind.** The Contractor has **no authority** to enter into
  contracts, incur obligations, or otherwise bind the Company, and will not
  represent that it can, without the Company's prior written authorization.
- **Own staff.** The Contractor is responsible for its own personnel and
  subcontractors, who must be bound by terms (including IP assignment and
  confidentiality) at least as protective as this Agreement. `TODO: confirm
whether subcontracting is permitted and on what terms.`

### 7. Term and termination

- **Term.** This Agreement begins on the Effective Date and continues until the
  Services are completed or it is terminated under this Section.
- **Termination for convenience.** Either Party may terminate this Agreement (or
  an SOW) for any reason on `[N days]` prior written notice (`TODO: notice period
TBD`).
- **Termination for cause.** Either Party may terminate immediately on written
  notice if the other Party **materially breaches** this Agreement and fails to
  cure the breach within `[N days]` of written notice (`TODO: cure period TBD`).
- **Effect of termination.** On termination, the Company will pay for Services
  properly performed and undisputed Deliverables accepted up to the termination
  date, and the Contractor will deliver all completed and in-progress Work Product
  and return Confidential Information per Section 4.
- **Survival.** Sections 3 (Intellectual property), 4 (Confidentiality), 5
  (Payment terms, for amounts accrued), 6 (Independent-contractor status), 8
  (Warranties), 9 (General), and any other provision that by its nature should
  survive, **survive** termination or expiration of this Agreement.

### 8. Warranties

- The Contractor represents and warrants that (a) the Work Product is **original**
  to the Contractor (except for properly licensed third-party or Pre-existing IP
  identified to the Company); (b) the Work Product and the Contractor's
  performance of the Services do **not infringe or misappropriate** any third
  party's intellectual-property or other rights; and (c) the Contractor has the
  **full right and authority** to enter into this Agreement and to make the
  assignment and grants in Section 3.
- The Contractor will perform the Services in a **professional and workmanlike**
  manner consistent with generally accepted industry standards.
- `TODO: decide whether any further warranties, disclaimers, indemnities, or
limitation-of-liability provisions are appropriate — these are deliberately left
to counsel and are not asserted here.`

### 9. General

- **Governing law and jurisdiction.** This Agreement is governed by the laws of
  `[Jurisdiction]`, without regard to its conflict-of-laws rules, and the Parties
  submit to the exclusive jurisdiction of the courts of `[Jurisdiction]`.
- **Dispute resolution.** The Parties will first attempt to resolve any dispute
  through good-faith negotiation. Failing resolution, disputes will be resolved by
  `[Dispute Resolution Mechanism — e.g. the courts of the Jurisdiction above, or
binding arbitration under specified rules and seat — TODO]`.
- **Entire agreement.** This Agreement, together with any executed SOWs, is the
  **entire agreement** between the Parties on its subject matter and supersedes all
  prior or contemporaneous understandings, whether written or oral.
- **Amendments.** Any amendment must be in **writing and signed** by both Parties.
- **Severability.** If any provision is held invalid or unenforceable, the
  remaining provisions remain in full force, and the invalid provision is to be
  reformed to the minimum extent necessary to make it enforceable while preserving
  the Parties' intent.
- **Assignment.** Neither Party may assign this Agreement without the other's prior
  written consent, except that the Company may assign it to a successor in
  connection with a merger, acquisition, or sale of substantially all of its
  assets.
- **Notices.** Notices must be in writing and sent to the addresses in Section 1
  (or as later updated in writing).

### 10. Signatures

> Not binding until signed and dated by **both** Parties.

| Company                                   | Contractor                                |
| ----------------------------------------- | ----------------------------------------- |
| `[Company Legal Name]`                    | `[Contractor Legal Name]`                 |
| Signature: **\*\*\*\***\_\_\_**\*\*\*\*** | Signature: **\*\*\*\***\_\_\_**\*\*\*\*** |
| Name: `[Authorized Signatory Name]`       | Name: `[Contractor Legal Name]`           |
| Title: `[Title]`                          | Title: `[Title, if applicable]`           |
| Date: `[Date]`                            | Date: `[Date]`                            |

---

## Related documentation

- **[Pricing](../pricing.md)** — the open-core framing (MIT package + optional
  managed hosting) that shapes the IP / open-source terms in Section 3.
- **[Data Processing Agreement (DPA) — template](../dpa.md)** — a separate
  template for the controller/processor relationship; consult it if an engagement
  involves access to user telemetry or personal data.
- **[LICENSE](../../LICENSE)** — the MIT license covering the ERNE product itself;
  open-source contributions are made under this license, not under the assignment
  in Section 3.

---

> **Final reminder.** Nothing on this page is legal advice or a binding
> commitment. This template is provided to speed up drafting **with counsel**;
> every `[Placeholder]` and `TODO` is unresolved on purpose, and **no company
> details, rates, dates, or jurisdictions have been filled in**. The Agreement is
> **not in force** unless and until it is executed by both Parties. Consult
> qualified legal counsel before relying on or signing any contractor agreement.
