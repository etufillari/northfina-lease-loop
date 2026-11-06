# Lease Loop — Product Requirements Document

**Version:** 1.0
**Status:** Hackathon build specification
**Last updated:** 5 November 2026
**Stack:** Next.js 16 (App Router), React 19, TypeScript, Prisma 7 on SQLite, Zod, Vitest, Tailwind 4 (as provided by the starter repository)

## 1. Executive summary

Lease Loop is a digital leasing platform that manages a physical asset through multiple customer relationships and leasing cycles. It supports the complete mandatory Spine: Catalogue, Price, Application, Contract, Invoices, End of term, and Second life.

**Product principle: One asset. Multiple lives. One continuous, trustworthy history.**

The team has selected three Smart Problems:

1. **Lock the price, not the tax:** lock agreed net rent and commercial terms at contract signing; calculate VAT for each invoice using the applicable invoice-date rate.
2. **Second-life matchmaking:** assess returned assets and match them to waiting customers using deterministic, explainable rules.
3. **Money that adds up:** use integer cents, reliable invoice schedules, correct calendar handling, and explicit rounding/reconciliation rules.

The selected wildcard is a **Dealer Dashboard** showing assets expected to return next month, their expected return dates, operational needs, and potential next-life opportunities.

The application must use rules, supplied data, and deterministic algorithms. **No AI, ML, or LLM features may be included in the app.** AI tools may be used to assist development under the hackathon rules.

## 2. Vision and value proposition

Make leasing circular, understandable, and operationally manageable by helping every asset move through successive useful lives without losing its history or financial integrity.

**Customers** can understand pricing, apply, sign, view invoices, and choose an end-of-term outcome.
**Dealers and operations staff** can plan for returns, inspections, refurbishment, and re-leasing.
**The business** can protect signed prices, calculate tax correctly, improve asset utilisation, and preserve asset history.

## 3. Goals and success criteria

### Product goals

- Deliver every stage of the mandatory Spine as a connected flow.
- Preserve an immutable snapshot of agreed financial terms at signing.
- Apply VAT using the applicable rate for each invoice date.
- Make money and invoice calculations accurate and reproducible.
- Make second-life allocation explainable and repeatable.
- Show dealers which assets are expected to return next month.
- Preserve the history of each physical asset across multiple leases.

### Hackathon success criteria

The team can demonstrate:

- Browsing an asset and receiving a live quote.
- An application with relevant questions and a decision plus reasons.
- A signed contract whose net rent is unaffected by later catalogue price changes.
- Invoices using the correct VAT rate for their dates.
- Correct month-end and leap-year invoice dates.
- Integer-cent calculations and exact reconciliation under the chosen billing model.
- An asset being returned, assessed, optionally refurbished, and matched to a waiting customer.
- A dealer seeing next month's expected returns and next operational steps.
- The same physical asset being leased again without overwriting its previous contract/history.

### Engineering success criteria

- Critical domain logic is implemented as pure TypeScript functions where practical and covered by tests.
- Money/date logic includes boundary tests and property-based tests if time and dependencies permit.
- API responses use a consistent envelope.
- Important state changes create audit/lifecycle records.
- Lint, type-check, tests, build, and CI pass.
- Code is modular and readable; no hand-written source file exceeds 600 lines (`npm run check:file-size` enforces this).
- Domain logic lives in `src/domain/` as pure functions with tests next to them; coverage is at least 60% on `src/domain`, `src/server`, `src/data` and `src/i18n`.
- Every data change goes through `withAudit()` and the audit trail is visible in the app.
- The UI is available in `en`, `fi`, `sv` and `et`, with identical keys in all four message files.
- `npm run check:all` passes locally before work is called done.
- Judge scenarios are handled by general rules, not hard-coded scenario answers.

## 4. Scope

### 4.1 Mandatory Spine

The Spine has exactly seven stages, as in `CHALLENGE.md`. Decision and history are part of Application and Second life respectively.

| #   | Stage       | Requirement                                                                                                                                                                                           |
| --- | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Catalogue   | Browse assets from `data/assets.json`, showing today's net price (from `data/price-lists.json`) and availability.                                                                                     |
| 2   | Price       | Select term and down payment; monthly price updates live.                                                                                                                                             |
| 3   | Application | Ask relevant questions from `data/questions.json`; validate answers. Return yes, no, or manual review with understandable reasons.                                                                    |
| 4   | Contract    | Signing stores an immutable snapshot of agreed terms and pricing inputs.                                                                                                                              |
| 5   | Invoices    | Generate monthly invoices from the signed contract, with date-correct VAT.                                                                                                                            |
| 6   | End of term | Support buy, return, or pass on.                                                                                                                                                                      |
| 7   | Second life | Inspect returned asset, decide refurbishment, set next-life price, and make it available for another lease. Previous contracts and lifecycle events stay linked to the same physical asset (history). |

### 4.2 Smart Problem 1 — Lock the price, not the tax

The challenge data describes a fictional Finnish VAT change from **25.5% to 26% on 1 January 2027**, using `data/vat-rates.json`.

**Required behaviour**

- Calculate a quote using the applicable price list and selected lease inputs.
- At signing, save a snapshot of agreed net rent and relevant commercial pricing inputs.
- Later price-list changes must not alter a signed contract.
- Resolve the VAT rate separately for each invoice using its applicable invoice date.
- Show locked net amount, VAT rate, VAT amount, and gross total on each invoice.
- Explain why gross amounts may change while the agreed net rent remains unchanged.
- Preserve historical invoice calculations even if price or VAT data changes later.

**Rule (from the challenge):** VAT is charged at the rate in force on the invoice date. This is settled; implement it as stated.

### 4.3 Smart Problem 3 — Second-life matchmaking

Use the supplied asset, condition/usage, residual, refurbishment, and demand data, including:

- `data/residual-curves.json`
- `data/refurbishment-costs.json`
- `data/second-life-demand.json`

**Required behaviour**

- Record return date, condition, usage/mileage, and inspection outcome.
- Determine whether refurbishment is required and calculate its cost from supplied data.
- Determine whether the asset is eligible for another lease.
- Evaluate waiting customers against compatibility, budget, minimum condition, and deadline.
- Rank eligible candidates using a deterministic, documented rule.
- Apply a stable tie-break when candidates have equal priority.
- Explain why a candidate is eligible/ineligible and why one candidate ranks above another.
- Calculate next-life price using supplied rules/data.
- Preserve previous leases, returns, inspections, and refurbishments in the asset history.

Do not silently invent unsupported rules. Document assumptions wherever the supplied data does not define a rule.

### 4.4 Smart Problem 5 — Money that adds up

**Required behaviour**

- Represent and calculate money as integer cents; never use floating-point arithmetic for money.
- Define and consistently apply rounding rules.
- Generate invoice schedules for the contract term.
- Handle month-end dates, including a lease starting on the 31st.
- Handle leap-year February, including February 2028.
- Handle a mid-month first period according to the agreed business rule.
- Ensure invoice amounts reconcile exactly with the agreed contract amounts under the selected billing model.
- Avoid cumulative rounding drift.
- Test boundary cases and representative randomised inputs where feasible.

Keep these concepts distinct: locked contractual net rent, per-invoice VAT, gross invoice total, down payment, end-of-term buyout, and total customer cost. Explicitly define which amounts are included in any contract-total reconciliation.

### 4.5 Wildcard — Dealer Dashboard: Next Month Returns

**Primary user:** Dealer or internal operations staff.

A forward-looking dashboard shows which assets are expected to return in the next calendar month and what should happen next.

**Dashboard information**

- Assets with a contractual end/return date in the next calendar month.
- Asset ID/category, current contract/customer reference, and expected return date.
- Expected return outcome, where known.
- Current lease/operational status.
- Known condition or usage information, where available.
- Expected next action: inspect, refurbish, offer to waiting customer, make available, or manual review.
- Summary counts of expected returns and operational statuses.

**Dashboard behaviour**

- Default to the next calendar month and display the date range.
- Distinguish forecast returns from assets physically returned and inspected.
- Allow filtering/grouping by date and status.
- Link each asset to its contract and lifecycle history.
- Where data supports it, show possible next-life matches or estimated next-life rent, clearly labelled as estimates.
- Provide an informative empty state when no returns are expected.

**MVP boundary:** Keep this as a read-oriented dashboard over existing contract, asset, and lifecycle data. Do not add notifications, calendar integrations, complex forecasting, or elaborate role management unless trivial in the starter project. A forecast is not a confirmed return.

## 5. Users and roles

- **Customer/lessee:** browse, configure quote, apply, sign, view invoices, choose end-of-term outcome.
- **Dealer/operations user:** review expected returns, receive assets, inspect, record refurbishment, and prepare the next lease.
- **Internal reviewer:** handle manual-review applications and record outcomes where supported.
- **Demo operator:** run seeded scenarios. Simulated signatures, approvals, or payments must be labelled as simulated.

## 6. Core user journeys

### 6.1 Customer lease

1. Browse catalogue and select an available asset.
2. Select term and down payment; review live quote and price breakdown.
3. Complete applicable application questions.
4. Receive approval, decline, or manual review with reasons.
5. Review and sign the agreement.
6. Persist immutable contract pricing snapshot.
7. Generate invoice schedule.
8. View invoices with net, VAT rate, VAT amount, and gross total.
9. Choose buy, return, or pass on at end of term.

### 6.2 Return and second life

1. Contract end date causes the asset to appear as an expected return.
2. Dealer sees it on the dashboard.
3. Asset is physically returned and inspected.
4. Condition, usage, and inspection result are recorded.
5. Rules determine refurbishment and cost.
6. Waiting customers are filtered and ranked.
7. The system explains the match and tie-break.
8. Asset is offered/reserved or made available.
9. A new contract can be created for the same physical asset.
10. Earlier contracts and lifecycle history remain intact.

### 6.3 Dealer planning

1. Open dashboard, defaulting to next calendar month.
2. Review expected returns and dates.
3. Filter or open an asset.
4. Inspect its current contract and asset history.
5. Review expected next action and potential demand.
6. When the item is returned and inspected, update it from forecast to actual operational status.

## 7. Functional requirements

**FR-01 Catalogue**

- Load supplied asset data; show asset details, current price, and availability.
- Prevent leasing assets that are unavailable, reserved, or otherwise ineligible.

**FR-02 Pricing calculator**

- Accept supported terms and down payment.
- Validate against supplied limits/data.
- Recalculate live and display a transparent breakdown.
- Use integer cents.
- Clearly label quote as non-binding until signing.

**FR-03 Application question flow**

- Load `data/questions.json`.
- Determine question applicability from customer type, asset, amount, and previous answers.
- Explain why a question is asked where practical.
- Reevaluate downstream questions when earlier answers change; discard or invalidate irrelevant answers.
- Validate required answers and formats.

**FR-04 Application decision**

- Use deterministic rules to return approved, declined, or manual review with reasons.
- Handle age, authority, amount, asset, and supplied rule boundaries.
- Do not hard-code judge scenario identities.

**FR-05 Contract creation and price lock**

- Create contract only after required approval/signing workflow.
- Snapshot term, down payment, locked net rent, pricing inputs, asset reference, and relevant price-list version.
- Preserve enough data to reproduce the agreement.
- Later catalogue changes must not mutate signed contracts.
- Record signing timestamp/audit event.
- Prevent conflicting active leases for the same physical asset.

**FR-06 Invoice generation**

- Generate schedule from signed contract.
- Resolve VAT using invoice-date data.
- Keep net rent locked; calculate VAT per invoice.
- Store applied VAT rate and calculations for historical reproducibility.
- Make generation idempotent; no duplicate installments.
- Use integer cents and documented rounding.
- Handle month-end, leap-year, and mid-month rules.
- Show net, VAT rate, VAT amount, and gross.

**FR-07 End of term**

- Support buy, return, and pass on.
- Apply supplied buyout/return rules.
- Record outcome and date.
- Return triggers inspection workflow.
- Pass-on must not overwrite the prior contract/history; confirm its exact business meaning with Northfina.

**FR-08 Return and inspection**

- Distinguish physical return from forecast return.
- Record condition, usage/mileage, inspection date, and outcome.
- Determine reusable/refurbishment/retirement/manual-review state.
- Record refurbishment work and cost; retain previous inspections.

**FR-09 Second-life matchmaking**

- Load waiting demand.
- Filter by asset compatibility, minimum condition, budget, and deadline.
- Rank deterministically and apply stable tie-break.
- Explain eligibility and ranking.
- Calculate next-life pricing from supplied rules.
- Prevent simultaneous allocation/reservation to multiple customers.

**FR-10 Asset history/passport**

- Maintain stable identity for each physical asset.
- Link multiple contracts to one asset.
- Record leases, returns, inspections, refurbishments, and re-leases chronologically.
- Never overwrite prior contract history.

**FR-11 Dealer Dashboard**

- Identify assets expected to return in the next calendar month.
- Display asset identity and expected return date.
- Clearly distinguish expected from actual returns.
- Show current status and next operational action.
- Link to asset details/history.
- Provide summary counts and useful empty states.
- Use deterministic queries over contract/asset data, not AI predictions.

**FR-12 Auditability**
Record important changes, including contract signing/price snapshot, invoice generation, end-of-term outcome, return, inspection, refurbishment, match decision, reservation, and re-lease. Events should include type, entity reference, timestamp, and structured details sufficient to explain the change.

- Every data change goes through `withAudit()` in `src/server/audit.ts` and uses the `tx` it provides for every write in that change. The change and its audit row commit in the same transaction; if the audit write fails, the change rolls back.
- The audit trail is shown in the app (extending the existing `/api/audit-log`).

## 8. Business rules and invariants

1. Signed contract commercial pricing is immutable.
2. Catalogue price changes affect new quotes, not signed contracts.
3. VAT is resolved per invoice using the applicable date-based rate in supplied data.
4. Invoice net rent comes from contract snapshot, never current catalogue.
5. Money is integer cents throughout domain calculations and persistence.
6. Rounding is explicit and consistent.
7. Invoice dates handle month-end and leap-year cases deterministically.
8. Invoice amounts reconcile under the documented billing model.
9. A physical asset cannot have conflicting active leases or simultaneous reservations.
10. A returned asset is not available for re-leasing before required inspection.
11. Refurbishment decisions/costs use supplied data and documented rules.
12. Matching is deterministic: identical inputs yield identical rankings.
13. Tie-break behaviour is stable and documented.
14. Previous contracts and lifecycle events remain after re-leasing.
15. Dashboard forecasts are labelled expected, not confirmed.
16. No AI, ML, or LLM functionality is included in the app.

## 9. Data sources

Inspect actual JSON schemas, units, and boundary semantics before implementation.

| File                            | Intended use                                                                                                                       |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `data/assets.json`              | Catalogue, asset identity, category, condition, usage, previous lives, status. **No prices.**                                      |
| `data/price-lists.json`         | Net list price per asset; v1 valid until 5 Nov 2026, v2 from 6 Nov 2026.                                                           |
| `data/customers.json`           | Ten personas (including edge cases) used by the scenarios and for seeding.                                                         |
| `data/questions.json`           | Conditional application questions and eligibility rules.                                                                           |
| `data/vat-rates.json`           | Effective-dated VAT rates.                                                                                                         |
| `data/residual-curves.json`     | Residual value and related calculations as defined by data.                                                                        |
| `data/coefficient-table.json`   | Monthly net rent = financed amount × factor (band by financed amount, factor by term 12/24/36/48); also the buyout at end of term. |
| `data/refurbishment-costs.json` | Refurbishment cost by supplied criteria.                                                                                           |
| `data/second-life-demand.json`  | Waiting customers, budgets, condition requirements, deadlines.                                                                     |
| `data/co2-factors.json`         | Optional impact calculations if implemented.                                                                                       |

Do not assume field names, units, inclusivity, or boundary semantics until the files are inspected. `data/DATA.md` and `src/data/schemas.ts` are the references; use the typed loaders in `src/data/`.

### Seed data

The demo needs seeded data beyond the data pack: customers from `customers.json`, and contracts (with invoices) for a few assets whose term ends in the next calendar month after "today", so the Dealer Dashboard has expected returns to show. Seeding is deterministic and goes through the normal domain and audit paths where practical.

## 10. Judge scenario coverage

These are test cases for general rules, not special-case implementations.

| Scenario                                                                      | Capability to demonstrate                                                                                                                                  |
| ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Aino leases `ebike-003`, 36 months, zero down, signed 5 Nov 2026              | Quote, signed snapshot, monthly net/VAT/gross, first three invoices, total cost.                                                                           |
| `laptop-004` quoted 5 Nov on price list v1; v2 is 8% cheaper at signing 6 Nov | Apply defined quote/signing price rule and explain which price is locked.                                                                                  |
| `ebike-001`, 24 months, starts 15 Sep 2026                                    | December 2026 and January 2027 invoices use correct VAT rates.                                                                                             |
| `laptop-001`, 36 months, starts 31 Jan 2026                                   | Correct February 2026 and February 2028 due dates.                                                                                                         |
| Mikko, 17, applies for `laptop-008`                                           | Kind, clear outcome/reason; no crash.                                                                                                                      |
| Norvi Logistics applies for four `ebike-004`; applicant lacks authority       | Correct authority-related decision/review and explanation.                                                                                                 |
| Haapalan Tila applies for `farm-002` (€145,000), 48 months, €20,000 down      | Relevant questions and manual-review reasons.                                                                                                              |
| Aino exits the first lease in month 7                                         | Fair early exit is not a selected Smart Problem. Out of scope; the app must not crash and should show a clear "not supported yet" message for this action. |
| `ebike-007` returned fair at 18,400 km                                        | Refurbishment decision, eligible waiting customers, deterministic winner, next rent.                                                                       |
| `ebike-008` has already had two lives                                         | Third lease preserves passport/history; CO₂ savings if implemented.                                                                                        |

Additional tests: VAT effective-date boundary; price-list version boundary; zero/max down payment; min/max term/amount; missing/invalid business data; 28th/29th/30th/31st starts; leap/non-leap February; mid-month first period; rounding boundaries; duplicate invoice generation; equal match candidates; ineligible condition/budget; reserved/leased asset; no expected dashboard returns.

## 11. UX and content requirements

- Use plain language for financial information and decisions.
- Show net, VAT rate, VAT amount, and gross separately.
- Explain why VAT changes can alter gross invoices without changing locked net rent.
- Explain why application questions are relevant where practical.
- Give kind, actionable decline/manual-review messages.
- Show matching reasons, not just a winner.
- Label forecasts, estimates, and simulated actions.
- Make dashboard date, asset, status, and next action easy to scan.
- Provide loading, validation, error, and empty states.
- Support keyboard navigation, visible focus, readable contrast, and labelled fields.
- Support `en`, `fi`, `sv` and `et`. All UI strings live in `src/i18n/messages/{en,fi,sv,et}.json` with the same keys in all four files (a test enforces this); no inline UI strings. Format currency and dates with the helpers in `src/i18n/format.ts`.

## 12. Technical and non-functional requirements

### Architecture

Use a modular monolith suitable for a short hackathon: Next.js UI, TypeScript domain modules for assets/pricing/applications/contracts/invoices/lifecycle, Prisma on SQLite, shared validation/API utilities, and deterministic seed data. Avoid microservices and unnecessary infrastructure. Read the relevant guide in `node_modules/next/dist/docs/` before writing Next.js code; this version has breaking changes.

### Repository conventions (judged; see `RULES.md`)

- **Domain location:** business logic is in `src/domain/` as pure functions: no I/O, database, `fetch`, `Date.now()`, `new Date()` or `Math.random()`. Dates (ISO `YYYY-MM-DD`) and data are passed in as arguments; pages and routes obtain "today" from `todayIso()` in `src/server/today.ts`.
- **API:** every route returns the envelope via `ok()` / `fail()` and is wrapped in `handleRoute()` from `src/server/api-response.ts`. Raw error messages and stack traces are never sent to the browser.
- **Audit:** all data changes use `withAudit()` (see FR-12).
- **Database:** edit `prisma/schema.prisma` and run `npm run db:migrate`; never hand-write migration SQL. Allowed values (status, condition, etc.) are validated with Zod before writing.
- **Money:** integer euro cents everywhere; round once, deliberately, and document the rule.
- **Files:** under 600 lines; split by responsibility.
- **Secrets:** none in git; examples go in `.env.example`.
- **Commits and hooks:** conventional commits (`type(scope): subject`); hooks stay on and `--no-verify` is never used.

### Domain logic

Keep critical logic independent from UI:

- money and rounding,
- date and invoice schedule,
- VAT rate resolution,
- contract price snapshot,
- second-life eligibility and ranking,
- dealer dashboard return-window query.

Use pure functions with explicit inputs/outputs. Validate external inputs at boundaries.

### Reliability

- Invoice generation is idempotent.
- Contract signing and asset reservation avoid conflicting leases.
- Use transactions for important multi-step changes where supported.
- Preserve historical contracts, invoices, and lifecycle events.
- Return clear errors and structured responses.

### Testing and delivery

- Unit tests for money, date, VAT, price snapshot, matching, and dashboard filtering.
- Integration tests for signing, invoices, return, and re-lease where feasible.
- Property-based tests for money/date invariants if feasible (a test-only dependency such as `fast-check` is acceptable).
- Coverage of at least 60% (lines, functions, branches, statements) on `src/domain`, `src/server`, `src/data` and `src/i18n`.
- Format check, lint, type-check, file-size check, no-AI check, tests and build pass in CI; run `npm run check:all` locally.
- Use clean conventional commits and the configured hooks.
- Keep every hand-written source file under 600 lines.
