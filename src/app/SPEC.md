---
id: app
type: module-design
status: active
title: Next.js App Router UI and HTTP API Routes
parent: architecture
depends-on: [data, domain, server, i18n]
---

## Responsibility

Owns the Next.js 16 App Router pages (`src/app/[locale]/`), reusable UI components (`src/components/`), root locale redirect (`src/proxy.ts`), and HTTP API route handlers (`src/app/api/`).

- **Localized UI shell and pages:**
  - `src/app/[locale]/layout.tsx` validates the `[locale]` route parameter, sets `<html lang={locale}>`, and renders the header and `LanguageSwitcher`.
  - `src/app/[locale]/page.tsx` opts into dynamic rendering (`await connection()`), reads `todayIso()`, loads assets from SQLite and price lists/coefficients/VAT from `data/`, computes each asset's price via `listPriceOn`, and renders `AssetCard` items grouped by category with `ContractDrawerTrigger`.
  - `src/app/[locale]/apply/page.tsx` prices the selected asset, term, and down payment, renders `ApplicationForm` + `DealSummary` + `ChangeTermsDialog`, and enables signing the lease inside `DecisionPanel` when `decision === 'yes'`. Signing marks the asset `'reserved'` via `PATCH /api/assets/[id]/status` and navigates to `/[locale]/invoices`.
  - `src/app/[locale]/invoices/page.tsx` computes the locked contract quote as of `signedOn` (from `?asset=&term=&down=&signedOn=`) so later price list updates cannot alter the agreed net rent, and renders the signed contract summary card alongside `MonthlyInvoices` (where each row opens `InvoiceBillDialog` with synthetic `Lease Loop Oy` company, SEPA bank, and Finnish reference number details).
- **HTTP API routes:**
  - `GET /api/assets`: Lists assets with optional `?category=` filtering.
  - `PATCH /api/assets/[id]/status`: Validates `{ status, actor }` and calls `changeAssetStatus` to update status and write an audit entry atomically.
  - `GET /api/audit-log`: Returns the 50 newest audit log entries.
  - `POST /api/applications/evaluate`: Stateless. Takes `{ deal: { category, financed_amount_cents, term_months }, answers, contract_start_date?, monthly_rent_incl_vat_cents? }` and returns the applicable `questions`, the pruned `answers`, the `dropped` ids and the eligibility `decision` with reasons. The customer type is read from `answers.q_customer_type`, never sent separately. `contract_start_date` defaults to `todayIso()`. The financed amount and rent are trusted from the caller until the pricing module can compute them server-side.

## Boundary

- **Composition root:** Orchestrates `data` (`@/data/load`, `@/data/schemas`), `domain`, `server`, and `i18n`. Reads the clock (`todayIso()`) once per request and passes the resulting `YYYY-MM-DD` string down to `domain`.
- **Forbidden reaches:** Must not embed business calculations (pricing formulas, eligibility rules, VAT logic) inline in components or route handlers — those belong in `domain`. Must not bypass `handleRoute()` / `ok()` / `fail()` in `/api/*` routes or bypass `withAudit()` for database writes. All user-facing strings must come from `i18n` (`getT(locale)`) or localized data-pack fields, never hardcoded inline literals.
- **Known limitations:**
  - `src/proxy.ts` redirects `/` unconditionally to `/en` without inspecting `Accept-Language`.
  - UI routes and API endpoints for steps 6–7 of the Spine (end-of-term and second life) are not yet built.
