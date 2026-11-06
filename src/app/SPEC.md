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
  - `src/app/[locale]/apply/page.tsx` prices the selected asset, term, and down payment, verifies active reservation ownership, enforces offer price protection via `calculateQuoteWithOffer` if catalogue prices increased since the offer was created, displays the price protection / active offer banner, renders `ApplicationForm` + `DealSummary` + `ChangeTermsDialog`, and enables creating a 14-day offer or signing the lease inside `DecisionPanel` when `decision === 'yes'`.
  - `src/app/[locale]/invoices/page.tsx` computes the locked contract quote as of `signedOn` (or from the stored offer reservation matched by `token` if signed under an offer) so later price list updates cannot alter the agreed net rent, displays the offer price protection / price lock banner if catalogue prices changed between offer and signing, and renders the signed contract summary card alongside `MonthlyInvoices` (where each row opens `InvoiceBillDialog` with synthetic `Lease Loop Oy` company, SEPA bank, and Finnish reference number details), `EarlyExitOptions` (a server component: a GET form picks the exit month `?exitMonth=` and the return condition `?condition=`, and it shows both early-exit options step by step with VAT at the exit date, and each option has an `EarlyExitAction` client button that confirms the amount and posts to the early-exit route), and `EndOfTermOptions` (for executing Buy, Return, and Pass-on resolution flows).
- **HTTP API routes:**
  - `GET /api/assets`: Lists assets with optional `?category=` filtering.
  - `PATCH /api/assets/[id]/status`: Validates `{ status, actor, token? }` and calls `changeAssetStatus` (and completes reservation if token supplied) to update status and write audit entries atomically.
  - `POST /api/assets/[id]/early-exit`: Validates `{ choice: 'buyout' | 'return', termMonths, downPaymentCents, signedOn, exitMonth, condition, actor }` (contract terms, never an amount) and calls `executeEarlyExit`, which prices the exit on the server and in one `withAudit()` transaction sets the asset to `'sold'` or `'returned'` (a return also records the condition) with audit action `lease.early_buyout` or `lease.early_return` and the full breakdown. 404 unknown asset, 409 `LEASE_ALREADY_ENDED`, 422 `INVALID_CONTRACT`.
  - `POST /api/assets/[id]/resolution`: Validates `{ action: 'buyout' | 'return' | 'pass_on', actor, details }` and calls `resolveAssetEndOfTerm` to record audit actions (`asset.bought_out`, `asset.returned`, `asset.passed_on`) and transition asset status to `'sold'` or `'returned'`.
  - `POST /api/assets/[id]/reserve`: Reserves an asset for an applicant or extends/upgrades an active reservation session, supporting both standard applications (up to 120 minutes) and post-approval longer-term offers (7/14/30-day presets, storing server-computed quotation terms), writing audit trail entries via `withAudit`.
  - `DELETE /api/assets/[id]/reserve`: Cancels/releases an active reservation on application abandonment or rejection.
  - `GET /api/assets/[id]/reserve`: Checks active reservation status, holder verification by token, remaining seconds, remaining offer days, and locked quotation terms.
  - `GET /api/audit-log`: Returns the 50 newest audit log entries.
  - `POST /api/applications/evaluate`: Stateless. Takes `{ deal: { category, financed_amount_cents, term_months }, answers, contract_start_date?, monthly_rent_incl_vat_cents? }` and returns the applicable `questions`, the pruned `answers`, the `dropped` ids and the eligibility `decision` with reasons. The customer type is read from `answers.q_customer_type`, never sent separately. `contract_start_date` defaults to `todayIso()`. The financed amount and rent are trusted from the caller until the pricing module can compute them server-side.
- **Application page:** `src/app/[locale]/apply/page.tsx` (`/[locale]/apply?asset=…&term=…&down=…&token=…`) prices the lease with `calculateContractQuote` / `calculateQuoteWithOffer` (honoring locked offer list prices if price increased), passes the rent incl. VAT and reservation token to `ApplicationForm` (backed by `useApplicationReservation`), which acquires/manages the reservation with a countdown timer, asks the questions through the evaluate route, auto-releases on rejection, and upon approval (`decision === 'yes'`) lets the customer either sign immediately or generate a 14-day offer (`OfferCreatedCard`) and sign the offer while valid. `ChangeTermsDialog` changes the term and down payment in a popup.
- **Contract configurator:** `src/components/contract.tsx` renders term and down-payment sliders with a live quote preview (calling the pure `calculateContractQuote`) and a collapsible price breakdown, attempts immediate asset reservation, and links to the application page with the reservation token where approval, offer generation, and signing take place.
- **Planned (see `ARCHITECTURE.md` §5 and §11):**
  - Pages: price step with term comparison, contract and invoices, early exit, end of term, a minimal second-life page (relist quote, waiting-list matches, relist), and the asset passport with CO₂ and money saved. The admin/back-office view is phase 2.
  - A header "today is…" date picker that sends `asOf` with every request (`resolveAsOf()` on the server, falling back to `todayIso()`).
  - Routes: `GET /api/quote` (preview), `POST /api/quotes` (locks the price), `POST /api/applications` (submits the final answers with a `quoteId`; re-runs `decideEligibility` server-side and stores `yes` / `manual_review`), `quoteId` on the evaluate route instead of caller-supplied amounts, `POST /api/contracts`, `GET /api/contracts/:id`, `GET /api/contracts/:id/exit-quote`, `POST /api/contracts/:id/exit`, `GET|POST /api/contracts/:id/end-of-term`, `GET /api/assets/:id/relist-quote`, `GET /api/assets/:id/matches`, `POST /api/assets/:id/relist`.

## Boundary

- **Composition root:** Orchestrates `data` (`@/data/load`, `@/data/schemas`), `domain`, `server`, and `i18n`. Resolves the date once per request (`resolveAsOf()`: the client's `asOf` if valid, otherwise `todayIso()`) and passes the resulting `YYYY-MM-DD` string down to `domain`. Client components may import pure `domain` functions for live previews only; the server recomputes before anything is saved.
- **Forbidden reaches:** Must not embed business calculations (pricing formulas, eligibility rules, VAT logic) inline in components or route handlers — those belong in `domain`. Must not bypass `handleRoute()` / `ok()` / `fail()` in `/api/*` routes or bypass `withAudit()` for database writes. All user-facing strings must come from `i18n` (`getT(locale)`) or localized data-pack fields, never hardcoded inline literals.
- **Known limitations:**
  - `src/proxy.ts` redirects `/` unconditionally to `/en` without inspecting `Accept-Language`.
  - Only the catalogue page, the application page, the contract configurator, the stateless evaluate route and the asset/audit routes exist; the planned pages and routes above are not yet built. Applications are not persisted yet.
  - Domain failures reach the UI as error codes; the UI translates codes (`errors.<CODE>`), never server messages.
