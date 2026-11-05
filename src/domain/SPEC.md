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
- **Target Spine & Smart Problem engines (not yet implemented):**
  - `pricing`: Monthly net rent, down payment deduction, VAT calculation, and end-of-term buyout amount.
  - `question-flow`: Conditional question targeting (`ask_when`), answer pruning when earlier answers change, Finnish business ID (Y-tunnus) check-digit validation, and eligibility classification (`yes`, `no`, `manual_review`).
  - `contract`: Immutable snapshot of agreed list price, down payment, financed amount, band, factor, and monthly net rent at signing.
  - `invoicing`: Monthly invoice schedule generation with invoice-date VAT lookup (`25.5%` vs. `26%` from `2027-01-01`), calendar end-of-month clamping (`Jan 31` → `Feb 28`/`29`), and cent reconciliation.
  - `end-of-term`: Buyout, return, extension, residual value calculation (`residual-curves.json`), and fair early-exit settlement.
  - `second-life`: Mandatory/optional refurbishment cost evaluation (`refurbishment-costs.json`), waiting-list matchmaking (`second-life-demand.json`), and circular CO₂ savings (`co2-factors.json`).

## Contracts and Decisions

- **Cent rounding rule:** Money is always an integer number of euro cents (`Number.isInteger(cents)`). Whenever multiplying by a factor or percentage yields a fractional cent (e.g., `financedCents * factor` or `netCents * (vatPercent / 100)`), round once to the nearest integer cent with `Math.round(value)` (matching `389000 * 0.027584 = 10730.18 → 10730` and `10730 * 0.255 = 2736.15 → 2736` in `data/DATA.md`). Passing a non-integer cent value to a domain function is a programming bug and throws `RangeError`.
- **Expected failures are values, not exceptions:** Domain rejections (amount below minimum, unknown asset, ineligible applicant) return discriminated unions (`{ ok: true, ... } | { ok: false, reason }`). Exceptions (`RangeError`) are thrown only for contract violations by the caller (non-integer cents or malformed `YYYY-MM-DD` strings).

## Boundary

- **Allowed imports:** Types and pure schemas from `data` (`@/data/schemas`) and sibling modules inside `src/domain/`.
- **Forbidden reaches (enforced by `eslint.config.mjs`):** Must never import `node:*`, `@/data/load`, `@/server/*`, `@/app/*`, `@prisma/*`, `@/generated/*`, `next/*`, or `react`, and must never access `fetch`, `process`, ` console`, `Date.now()`, `new Date()`, or `Math.random()`. All dates arrive as `YYYY-MM-DD` arguments from the caller.
