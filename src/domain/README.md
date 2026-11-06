# src/domain: the business rules

This folder holds the rules of Lease Loop as plain functions. Most of your
hackathon work belongs here.

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

| File                           | What it does                                                                                                                                                                                                   |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pricing/coefficient.ts`       | Worked example: finds the monthly factor for a financed amount and term.                                                                                                                                       |
| `pricing/price-list.ts`        | Worked example: finds the net list price of an asset on a date.                                                                                                                                                |
| `money.ts`                     | `roundedDivide` is the one rounding rule. `formatEuro` formats cents for a locale; use it only in the UI.                                                                                                      |
| `pricing/pricing.ts`           | `quote` prices a deal: financed amount, band, monthly net rent and buyout.                                                                                                                                     |
| `vat.ts`                       | The VAT rate on a date, and VAT on a net amount.                                                                                                                                                               |
| `dates.ts`                     | `addDays` and `addMonths` on ISO dates. `addMonths` clamps to short months.                                                                                                                                    |
| `assets/status.ts`             | `canChangeStatusByHand` keeps `leased` and `sold` under the control of contracts.                                                                                                                              |
| `contract/contract.ts`         | `signingProblem` says who may sign, `lockedQuote` keeps the quoted price, `buildContract` builds the contract, and `openLife` opens the asset's next life.                                                     |
| `invoicing/invoicing.ts`       | `invoiceSchedule` gives every invoice of a contract, each with the VAT rate on its own date.                                                                                                                   |
| `end-of-term/end-of-term.ts`   | The customer's choice at the end of a lease, its 7-day window, and the buyout invoice.                                                                                                                         |
| `application/question-flow.ts` | `questionsToAsk` works out which questions apply and drops answers that no longer do. `invalidAnswers` checks each answer fits its question type. `blockingAnswer` finds an answer that stops the application. |
| `application/age.ts`           | `ageOn` gives an age in whole years on a date, and `eligibleFrom` gives the date someone reaches an age.                                                                                                       |
| `application/business-id.ts`   | `isValidBusinessId` checks the format and check digit of a Finnish Y-tunnus.                                                                                                                                   |
| `application/eligibility.ts`   | `decide` applies the eligibility rules and returns yes, no or manual review, with every reason.                                                                                                                |
| `identity.ts`                  | Roles for the no-password "acting as" login: merges customers and staff into one `Identity` list, and `can(role, permission)` decides what each role may do.                                                   |

## What teams are expected to add

Create these as you need them. Do not commit empty files.

- `second-life`: refurbishment cost, matching a returned item to the waiting list, CO2 saved.
