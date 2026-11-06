---
id: goal-and-requirements
type: goal-and-requirements
status: active
title: Lease Loop — Goal and Requirements
---

## Goal

Lease Loop is a circular-economy asset leasing web application for e-bikes, laptops, and farm machines built for the Northfina × Hive Helsinki hackathon. It takes a physical asset through multiple lease lives — from catalogue browsing and live price calculation, through conditional underwriting, price-locked contracts, monthly VAT-aware invoicing, and end-of-term exit or return, into refurbishment and second- or third-life re-leasing — using deterministic financial and eligibility rules that a bank can audit and explain.

## Audience

- **Customers (consumers, sole traders, companies)** in Finland and the Baltics (`en`, `fi`, `sv`, `et`) who browse assets, compare lease terms, apply for financing, manage contracts and invoices, or join the second-life waiting list.
- **Dealers and financing reviewers** who inspect asset status, handle manual underwriting reviews, manage returned items, and verify the transactional audit log. Their admin/back-office view is **phase 2**. Phase 1 is customer-facing only, plus a minimal second-life page for the demo.

## Capabilities

### Implemented in the current baseline

- **Multi-locale filterable asset catalogue:** Displays the 30 physical assets from SQLite by category tab (`e_bike`, `laptop`, `farm_machine`) with free-text search, status filter, min/max euro price filter (`catalogue-filter.ts`), condition, usage counter (`km`, `battery_cycles`, `engine_hours`), previous lives, availability status, and date-effective net list price across English, Finnish, Swedish, and Estonian (`/[locale]`).
- **Date-versioned list pricing and coefficient lookup:** Resolves an asset's net list price for any ISO calendar date (`listPriceOn`) and resolves the financing band (`A`–`D`) and monthly rent factor for a financed cent amount and term (`monthlyFactorFor`).
- **Contract quote, configurator, and reservations/offers:** `calculateContractQuote` (`src/domain/contract-pricing.ts`) computes monthly net rent, VAT, buyout and totals from list price, term and down payment, matching the DATA.md worked example. `src/components/contract.tsx` offers term and down-payment sliders with a collapsible price breakdown, reserves the asset (`POST /api/assets/[id]/reserve`), and navigates to the application flow. Approved applicants can either sign immediately or lock a 14-day binding offer with price protection (`offer.ts`, `OfferCreatedCard`).
- **Application flow and eligibility:** `question-flow.ts` shows only the applicable questions and prunes answers that stop applying; `business-id.ts` checks Y-tunnus check digits; `eligibility.ts` decides `yes`, `no`, `manual_review` or `incomplete` with translatable reasons. The `/[locale]/apply` page calls the stateless `POST /api/applications/evaluate` route on every change and auto-releases the reservation if the decision is `no`.
- **Signed contract, dynamic-VAT invoices, early exit, and end-of-term resolution:** Signing a contract persists `Quote`, `Application`, `Contract`, `InvoiceRow[]`, and `AssetEvent` rows in SQLite and sets `Asset.status = 'leased'`. `/[locale]/invoices` loads the persisted contract DB-first (with URL query-parameter fallback for direct scenario links), rendering the locked contract summary, the full monthly invoice schedule (`invoice-schedule.ts`, `MonthlyInvoices`, `InvoiceBillDialog`) with dynamic per-invoice VAT and month-end date clamping, step-by-step fair early exit (`early-exit.ts`, `EarlyExitOptions`, `POST /api/assets/[id]/early-exit`), and end-of-term Buy / Return / Pass-on options (`end-of-term.ts`, `EndOfTermOptions`, `POST /api/assets/[id]/resolution`).
- **Second-life valuation, waiting-list matchmaking, asset passport & relisting (Spine step 7):** Returned and multi-life assets display their residual market value (`relist_price_cents`), ranked waiting-list match + excluded candidates with reasons (`evaluateSecondLifeCandidates`), multi-life passport (`AssetEvent` timeline), and avoided manufacturing CO₂ right in the catalogue card and drawer (`SecondLifePanel`), and can be relisted via `POST /api/assets/[id]/relist` (`returned → available` at `relist_price_cents`) to start a second or third lease.
- **Audited asset & contract mutations:** Lists assets (`GET /api/assets`) and records every status, reservation, offer, contract signing, early-exit, end-of-term, and relist change inside an atomic `withAudit()` transaction (`GET /api/audit-log`).
- **Validated data pack & full SQLite persistence:** Parses and validates all ten reference datasets with strict Zod schemas, seeds all reference tables into SQLite (`prisma/seed.ts`, `src/server/reference-seed.ts`) using integer basis points and parts per million, and reads them back from SQLite at runtime (`src/server/reference-read.ts`, with automatic fallback to `src/data/load.ts` when an unseeded test DB is used).

### Confirmed product scope (The Spine & Smart Problems)

- **Interactive pricing & transparent breakdown:** Live monthly rent and end-of-term buyout calculation by term (`12` / `24` / `36` / `48` months) and down payment, with side-by-side term comparison and plain-language breakdown of list price, down payment, financed amount, band coefficient, VAT, buyout, and total cost.
- **Conditional application flow & eligibility engine:** Evaluates `ask_when` rules from `data/questions.json`, surfaces localized `why_we_ask` explanations, prunes invalidated answers when an applicant edits an earlier answer, validates Finnish business IDs (Y-tunnus check digit), and returns a deterministic decision (`yes`, `no`, or `manual_review`) with explicit reasons.
- **Price-locked contracts:** Locks the agreed net list price, down payment, financed amount, coefficient band/factor, and monthly net rent when a quote or contract is created so subsequent price-list revisions (such as price list v2 on `2026-11-06`) never alter signed terms.
- **Exact cent invoicing & dynamic VAT:** Generates monthly invoice schedules where net rent stays locked to the contract, VAT is calculated at the rate valid on each invoice's due date (handling the `25.5%` → `26%` change on `2027-01-01`), calendar edge cases (such as `Jan 31` starts into short and leap-year Februaries) follow deterministic due-date rules, and rounded integer-cent invoices reconcile cleanly with contract totals.
- **Fair early exit & end-of-term resolution:** Supports end-of-term buyout, return, or extension, and provides a transparent early-termination settlement formula consistent with residual value curves (`data/residual-curves.json`), discount rates, and end-of-term buyout percentages.
- **Second-life matchmaking & asset passport:** Prices returned assets at their residual market value (`data/residual-curves.json`) as they come back, matches leasable used items against waiting-list demand (`data/second-life-demand.json`) with deterministic tie-breaking, and tracks each asset's multi-life passport and avoided CO₂ / financial savings (`data/co2-factors.json`). Refurbishment (`data/refurbishment-costs.json`) is not in the current plan.

## Non-Goals

- **No AI, ML, or LLM features inside the product:** Every pricing, underwriting, invoicing, and matching outcome must be produced by deterministic rules and algorithms (`npm run check:no-ai`).
- **No external payment gateway, bank API, or identity provider integration:** All reference data is self-contained in `data/` and local SQLite.

## Known Limitations (Current Baseline)

- **Single-rate quote preview totals:** `calculateContractQuote` computes `totalRentGrossCents` with the signing-date VAT rate for the live slider preview, whereas `generateInvoiceSchedule` and persisted `Contract.total_gross_cents` compute the true multi-year gross total across the `2027-01-01` VAT change.
- **No refurbishment and no admin view:** Returned items are valued and relisted without refurbishment upgrades (`data/refurbishment-costs.json`), and the dealer/reviewer back office is phase 2.
- **Unauthenticated actor & static root locale redirect:** Write endpoints trust the caller-supplied `actor` string in the request body, and `src/proxy.ts` redirects `/` unconditionally to `/en` rather than negotiating `Accept-Language`.
