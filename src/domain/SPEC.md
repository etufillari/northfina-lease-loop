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
  - `contract-pricing.ts` (`calculateContractQuote`, `vatRateOn`, `downPaymentBoundsFor`, `clampDownPaymentCents`, `availableTermsFromTable`): Quote from list price, term and down payment (monthly net rent, VAT, buyout, totals) and VAT lookup by date. Moves into `pricing/` and switches to integer rates (see rounding rule below).
  - `money.ts` (`formatEuro`): Formats integer euro cents into localized currency strings at the UI edge.
  - `question-flow.ts`: `evaluateCondition` / `isAskable` evaluate `ask_when` (all conditions must hold; `in` compares as text, `gte`/`lte` are inclusive and numeric only; an unknown value never satisfies a condition). `visibleQuestions` returns the applicable questions in bank order and ignores the stored answer of any question that is itself hidden. `pruneAnswers` returns `{ kept, dropped }` after an earlier answer or the deal changes; cascades resolve in one pass and answers for unknown ids are dropped too.
  - `business-id.ts` (`isValidBusinessId`): Finnish Y-tunnus format and check digit (weights 7, 9, 10, 5, 8, 4, 2; remainder 1 is never valid).
  - `eligibility.ts` (`decideEligibility`, `ageOn`): turns answers into `yes`, `no`, `manual_review` or `incomplete` (with the missing question ids). Reasons are `{ rule, outcome, params }`, never prose, so the UI translates them. A hard `no` wins immediately, even while other questions are unanswered; then `incomplete`; then `manual_review`. Rules: `min_age` (on the contract start date), `residency`, `affordability` (rent incl. VAT × 100 > income × 30, integers only; skipped when the caller passes no rent or the income question was not asked), `business_id`, `pep_manual_review`, `financed_limits`. Two ids go beyond the data pack: `signatory_required` (applicant cannot sign for a company: manual review) and `blocked_answer` (any `answer_in` block other than the country). Income answers are whole cents.
  - `date-input.ts`: Converts dates typed as day/month/year to and from ISO (`YYYY-MM-DD`) at the UI edge.
- **Target Spine & Smart Problem engines (not yet implemented; see `docs/architecture.md` §4.2):**
  - `money/`: The single rounding helper (`mulDivRound`), rate conversion to basis points / parts per million, `allocate`, calendar helpers (`addMonthsClamped`, leap years; billing day anchored to the start day), invoice schedule generation with invoice-date VAT (`25.5%` vs. `26%` from `2027-01-01`), and derived row status by `asOf`. Contract gross total = sum of row gross.
  - `pricing/`: Monthly net rent, down payment deduction, VAT calculation, end-of-term buyout amount, and per-term comparison.
  - `contract/`: Contract built from the locked quote snapshot (price list version, list price, down payment, financed amount, band, factor, interest, term, monthly net rent, buyout) plus the generated schedule. The price is locked when the quote is created.
  - `early-exit/`: Discounted outstanding balance at the band rate, early-buyout and early-return quotes with breakdown lines that sum to the total; equals the end-of-term buyout on the last day.
  - `end-of-term/`: Buy out, return, or extend (stretch).
  - `second-life/`: Residual market value (`residual-curves.json`), relist price (no refurbishment), and waiting-list matchmaking (`second-life-demand.json`) with exclusion reasons and deterministic tie-breaking (earliest `needed_by`, then signup order).
  - `impact/`: CO₂ avoided (`co2-factors.json`, scaled by relist value) and money saved per life and for the fleet.
  - `lifecycle/`: Allowed status transitions for assets, contracts and applications.
  - `config.ts`: Tunable constants (affordability 30 %, minimum age 18, exit fee, return credit, minimum relist condition) passed into functions as arguments.

## Contracts and Decisions

- **Cent rounding rule:** Money is always an integer number of euro cents (`Number.isInteger(cents)`). Rates are integers, converted once at the data edge: VAT and interest in basis points (`25.5` → `2550`), coefficient factors in parts per million (`0.027584` → `27584`), buyout as a whole percent. Every derived amount is rounded once, half up, with integer arithmetic via `mulDivRound(a, num, den)`: rent = `mulDivRound(financed, factorPpm, 1_000_000)`, VAT = `mulDivRound(net, vatBp, 10_000)`, buyout = `mulDivRound(financed, percent, 100)`. This matches `data/DATA.md` (`10730`, `2736`, `13466`, `58350`). The only float step is the present-value discount in `early-exit/`, rounded once with `Math.round`. Passing a non-integer cent value to a domain function is a programming bug and throws `RangeError`.
- **Expected failures are values, not exceptions:** Domain rejections (amount below minimum, unknown asset, ineligible applicant) return discriminated unions (`{ ok: true, ... } | { ok: false, reason }`). Exceptions (`RangeError`) are thrown only for contract violations by the caller (non-integer cents or malformed `YYYY-MM-DD` strings).

## Boundary

- **Allowed imports:** Types and pure schemas from `data` (`@/data/schemas`) and sibling modules inside `src/domain/`.
- **Forbidden reaches (enforced by `eslint.config.mjs`):** Must never import `node:*`, `@/data/load`, `@/server/*`, `@/app/*`, `@prisma/*`, `@/generated/*`, `next/*`, or `react`, and must never access `fetch`, `process`, ` console`, `Date.now()`, `new Date()`, or `Math.random()`. All dates arrive as `YYYY-MM-DD` arguments from the caller.
