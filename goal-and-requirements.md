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
- **Dealers and financing reviewers** who inspect asset status, handle manual underwriting reviews, manage returned items and refurbishment decisions, and verify the transactional audit log.

## Capabilities

### Implemented in the current baseline

- **Multi-locale asset catalogue:** Displays the 30 physical assets from SQLite grouped by category (`e_bike`, `laptop`, `farm_machine`) with condition, usage counter (`km`, `battery_cycles`, `engine_hours`), previous lives, availability status, and date-effective net list price across English, Finnish, Swedish, and Estonian (`/[locale]`).
- **Date-versioned list pricing and coefficient lookup:** Resolves an asset's net list price for any ISO calendar date (`listPriceOn`) and resolves the financing band (`A`–`D`) and monthly rent factor for a financed cent amount and term (`monthlyFactorFor`).
- **Audited asset status API:** Lists assets (`GET /api/assets`) and updates asset status (`PATCH /api/assets/[id]/status`) inside an atomic transaction that records an `AuditLog` entry (`GET /api/audit-log`).
- **Validated data pack:** Parses and validates all ten reference datasets (`assets`, `price-lists`, `coefficient-table`, `vat-rates`, `residual-curves`, `refurbishment-costs`, `second-life-demand`, `questions`, `customers`, `co2-factors`) with strict Zod schemas.

### Confirmed product scope (The Spine & Smart Problems)

- **Interactive pricing & transparent breakdown:** Live monthly rent and end-of-term buyout calculation by term (`12` / `24` / `36` / `48` months) and down payment, with side-by-side term comparison and plain-language breakdown of list price, down payment, financed amount, band coefficient, VAT, buyout, and total cost.
- **Conditional application flow & eligibility engine:** Evaluates `ask_when` rules from `data/questions.json`, surfaces localized `why_we_ask` explanations, prunes invalidated answers when an applicant edits an earlier answer, validates Finnish business IDs (Y-tunnus check digit), and returns a deterministic decision (`yes`, `no`, or `manual_review`) with explicit reasons.
- **Price-locked contracts:** Locks the agreed net list price, down payment, financed amount, coefficient band/factor, and monthly net rent when a quote or contract is created so subsequent price-list revisions (such as price list v2 on `2026-11-06`) never alter signed terms.
- **Exact cent invoicing & dynamic VAT:** Generates monthly invoice schedules where net rent stays locked to the contract, VAT is calculated at the rate valid on each invoice's due date (handling the `25.5%` → `26%` change on `2027-01-01`), calendar edge cases (such as `Jan 31` starts into short and leap-year Februaries) follow deterministic due-date rules, and rounded integer-cent invoices reconcile cleanly with contract totals.
- **Fair early exit & end-of-term resolution:** Supports end-of-term buyout, return, or extension, and provides a transparent early-termination settlement formula consistent with residual value curves (`data/residual-curves.json`), discount rates, and end-of-term buyout percentages.
- **Second-life refurbishment, matchmaking & asset passport:** Evaluates mandatory and optional refurbishment steps (`data/refurbishment-costs.json`) and residual values for returned assets, matches leasable used items against waiting-list demand (`data/second-life-demand.json`) with deterministic tie-breaking, and tracks each asset's multi-life passport and avoided CO₂ / financial savings (`data/co2-factors.json`).

## Non-Goals

- **No AI, ML, or LLM features inside the product:** Every pricing, underwriting, invoicing, and matching outcome must be produced by deterministic rules and algorithms (`npm run check:no-ai`).
- **No external payment gateway, bank API, or identity provider integration:** All reference data is self-contained in `data/` and local SQLite.

## Known Limitations (Current Baseline)

- **Only step 1 of the Spine is wired end-to-end:** The catalogue view, asset status mutation, and worked domain functions (`coefficient.ts`, `price-list.ts`, `money.ts`) exist; quote/pricing, question-flow, contract, invoicing, end-of-term, and second-life modules are not yet implemented.
- **Hybrid persistence model:** `data/assets.json` is seeded into SQLite (`Asset`), whereas reference tables (`price-lists`, `coefficient-table`, `vat-rates`, `questions`, etc.) are read from disk JSON on demand without caching.
- **Unauthenticated actor & static root locale redirect:** Write endpoints trust the caller-supplied `actor` string in the request body, and `src/proxy.ts` redirects `/` unconditionally to `/en` rather than negotiating `Accept-Language`.
