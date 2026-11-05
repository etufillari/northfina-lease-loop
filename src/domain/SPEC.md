---
id: domain
type: module-design
status: active
title: Pure Domain Logic
parent: architecture
depends-on: [data]
---

## Responsibility

Owns all pure, deterministic business logic for Lease Loop. Every calculation, rule evaluation, and state-transition decision is expressed here as a plain function with a co-located Vitest suite (`*.test.ts`).

- **Implemented rules:**
  - `coefficient.ts` (`monthlyFactorFor`): Resolves the financing band (`A`–`D`, inclusive cent bounds) and monthly factor for a financed cent amount and term (`12`, `24`, `36`, `48` months), returning `{ ok: false, reason: 'below_minimum' | 'above_maximum' | 'unknown_term' }` when out of bounds.
  - `price-list.ts` (`listPriceOn`): Resolves an asset's net list price and price-list version on a given `YYYY-MM-DD` date (`valid_from <= isoDate` and `valid_to === null || isoDate <= valid_to`).
  - `money.ts` (`formatEuro`): Formats integer euro cents into localized currency strings at the UI edge.
  - `question-flow.ts`: `evaluateCondition` / `isAskable` evaluate `ask_when` (all conditions must hold; `in` compares as text, `gte`/`lte` are inclusive and numeric only; an unknown value never satisfies a condition). `visibleQuestions` returns the applicable questions in bank order and ignores the stored answer of any question that is itself hidden. `pruneAnswers` returns `{ kept, dropped }` after an earlier answer or the deal changes; cascades resolve in one pass and answers for unknown ids are dropped too.
  - `business-id.ts` (`isValidBusinessId`): Finnish Y-tunnus format and check digit (weights 7, 9, 10, 5, 8, 4, 2; remainder 1 is never valid).
  - `eligibility.ts` (`decideEligibility`, `ageOn`): turns answers into `yes`, `no`, `manual_review` or `incomplete` (with the missing question ids). Reasons are `{ rule, outcome, params }`, never prose, so the UI translates them. A hard `no` wins immediately, even while other questions are unanswered; then `incomplete`; then `manual_review`. Rules: `min_age` (on the contract start date), `residency`, `affordability` (rent incl. VAT × 100 > income × 30, integers only; skipped when the caller passes no rent or the income question was not asked), `business_id`, `pep_manual_review`, `financed_limits`. Two ids go beyond the data pack: `signatory_required` (applicant cannot sign for a company: manual review) and `blocked_answer` (any `answer_in` block other than the country). Income answers are whole cents.
  - `contract-pricing.ts` (`vatRateOn`, `calculateVatCents`, `calculateContractQuote`, `signContract`, `downPaymentBoundsFor`): Computes net monthly rent, signing-date VAT, gross rent, buyout amount, and immutable `SignedContract` snapshots from list price, down payment, term, and coefficient table.
  - `invoice-schedule.ts` (`isLeapYear`, `daysInMonth`, `addMonthsClamped`, `formatInvoiceNumber`, `generateFinnishReferenceNumber`, `generateInvoiceSchedule`): Pure calendar date math with month-end clamping (`Jan 31` → `Feb 28` / `Feb 29` on leap years), deterministic invoice document ID and modulo-10 (weights 7, 3, 1) Finnish reference number generation, and monthly invoice generation that locks contract net rent while resolving VAT dynamically on each invoice's due date (`isVatChangedFromSigning`).
- **Target Spine & Smart Problem engines (not yet implemented):**
  - `end-of-term`: Buyout, return, extension, residual value calculation (`residual-curves.json`), and fair early-exit settlement.
  - `second-life`: Mandatory/optional refurbishment cost evaluation (`refurbishment-costs.json`), waiting-list matchmaking (`second-life-demand.json`), and circular CO₂ savings (`co2-factors.json`).

## Contracts and Decisions

- **Cent rounding rule:** Money is always an integer number of euro cents (`Number.isInteger(cents)`). Whenever multiplying by a factor or percentage yields a fractional cent (e.g., `financedCents * factor` or `netCents * (vatPercent / 100)`), round once to the nearest integer cent with `Math.round(value)` (matching `389000 * 0.027584 = 10730.18 → 10730` and `10730 * 0.255 = 2736.15 → 2736` in `data/DATA.md`). Passing a non-integer cent value to a domain function is a programming bug and throws `RangeError`.
- **Expected failures are values, not exceptions:** Domain rejections (amount below minimum, unknown asset, ineligible applicant) return discriminated unions (`{ ok: true, ... } | { ok: false, reason }`). Exceptions (`RangeError`) are thrown only for contract violations by the caller (non-integer cents or malformed `YYYY-MM-DD` strings).

## Boundary

- **Allowed imports:** Types and pure schemas from `data` (`@/data/schemas`) and sibling modules inside `src/domain/`.
- **Forbidden reaches (enforced by `eslint.config.mjs`):** Must never import `node:*`, `@/data/load`, `@/server/*`, `@/app/*`, `@prisma/*`, `@/generated/*`, `next/*`, or `react`, and must never access `fetch`, `process`, ` console`, `Date.now()`, `new Date()`, or `Math.random()`. All dates arrive as `YYYY-MM-DD` arguments from the caller.
