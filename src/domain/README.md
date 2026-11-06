# src/domain: the business rules

This folder holds every business rule of Lease Loop as a plain function. Pages, API routes
and the database layer call these; none of them decides anything on its own.

## Rules for this folder

1. **Pure.** No database, no files, no network, no `process.env`, no framework imports.
   A function gets everything it needs as arguments and returns a value.
2. **Deterministic.** No `Date.now()`, `new Date()` or `Math.random()`. Dates come in as
   ISO strings (`YYYY-MM-DD`) chosen by the caller. The same input always gives the same output.
3. **Money is integer cents.** `189900` means 1 899,00 €. Do not use floats for money, and
   decide on purpose where you round (and say so in a comment).
4. **Expected failures are values, not exceptions.** "This amount cannot be financed" is an
   answer the UI must show, so return a result such as
   `{ ok: false, reason: 'below_minimum' }`. Throw only for bugs (for example, a fraction of
   a cent).
5. **Every function has tests.** Put them next to the code (`pricing.ts` → `pricing.test.ts`)
   and test the edges: band limits, the first and last day of a date range, zero, empty lists.

ESLint enforces rules 1 and 2 for this folder (see `eslint.config.mjs`).

## What is here

Every module has its tests next to it (`pricing.ts` → `pricing.test.ts`). The reasoning behind
each rule is in [docs/DECISIONS.md](../../docs/DECISIONS.md).

| Area               | Modules                                                                                                                                                                                                                                                                          |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Price              | `coefficient` (band and factor), `price-list` (price on a date), `pricing` (quote, down-payment limits), `rounding`, `money`, `euro-input`, `vat`                                                                                                                                |
| Applying           | `question-flow` (which question next, pruning), `answer-check` (an answer fits its question), `eligibility` (the six rules, with reasons), `affordability` (30 % in every month), `business-id`                                                                                  |
| Contract and money | `contract` (lock at signing, quote validity), `invoicing` (the schedule, leftover cents), `calendar` (clamped due dates, ages), `buyout`, `early-exit`                                                                                                                           |
| Holds and claims   | `holds` (every hold length in one table), `claims` (one physical item, one contract)                                                                                                                                                                                             |
| Second life        | `residual` (market value and its factors), `usage` (lifetime and since-reset counters), `inspection` (return grade, wear across leases), `second-life` (refurbish, upgrade, re-price, match), `second-life-allocation` (the whole desk: one offer per person, whole sets), `co2` |
