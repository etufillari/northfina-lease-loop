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

| File             | What it does                                                             |
| ---------------- | ------------------------------------------------------------------------ |
| `coefficient.ts` | Worked example: finds the monthly factor for a financed amount and term. |
| `price-list.ts`  | Worked example: finds the net list price of an asset on a date.          |
| `money.ts`       | Formats cents as euros for a locale. Use it only in the UI.              |

## What teams are expected to add

Create these as you need them. Do not commit empty files.

- `pricing`: monthly rent, down payment, VAT and the end-of-term buyout price.
- `question-flow`: which question to ask next, from `data/questions.json`, and what happens
  to answers that stop applying.
- `contract`: build the contract from an approved application and lock it so it cannot change.
- `invoicing`: the monthly invoices for a contract, including a VAT rate change mid-contract.
- `end-of-term`: return, buy out or extend, and the value of the returned item.
- `second-life`: refurbishment cost, matching a returned item to the waiting list, CO2 saved.

## Second-life valuation policy

`residual-value.ts` estimates market value from `data/residual-curves.json`.
Callers supply the original net price and age in whole months from the stored
valuation reference. `valuation-baseline.ts` uses recorded first-lease facts when
available. For imported history, the approved, explicitly labelled assumptions
are price list v1 and 1 January of the model year. Previous-life counts are never
used as ages. Missing prices return an explicit result instead of invented values.

Age counts completed anchored calendar months at the expected ready date (31 January
to 28 February counts as one month). The baseline is saved on the asset in the same
audited transaction as signing or relisting and survives release revisions. A new
lease price does not replace the original reference. Verified operator corrections
require their date, integer-cent price and a source/reason; previews do not save them.

Age percentages are interpolated linearly between curve points and held at the
endpoints outside the curve. Usage depreciation counts completed steps, applies
the category's percentage reduction and stops at its cap. Condition applies its
own multiplier. The calculation uses exact integer ratios and rounds half-up to
euro cents only once, after multiplying every factor. It never rounds an
intermediate age-adjusted price.

This is a market-value estimate, not an automatic refurbishment decision or lease
offer. Repair costs and a documented next-lease pricing policy must be considered
separately. Replacing a component does not erase the physical item's cumulative
usage for this valuation.

`refurbishment-options.ts` compares required work and estimated market value at
each condition that does not downgrade the asset. Unsupported upgrades remain
visible with a reason. Net recovery is market value minus all repair costs, not
accounting profit: acquisition costs, overhead and future lease income are not
included. Negative recovery is economically unviable; zero is break-even. Missing
valuation or service history cannot establish viability.

Fair condition is only a conditional option. The existing readiness function
continues to require good condition unless the caller explicitly supplies
`acceptsFairCondition`; matching must justify that exception with a waiting
customer who accepts fair. Mandatory work still applies, including a laptop's
data wipe. Plans do not record completion, reserve stock or change any asset.

`second-life-matching.ts` offers the post-repair market value as the next net
list price with zero down payment. It uses the existing coefficient engine and
the waiting customer's preferred term. Required work, non-negative estimated
recovery, category, condition, net monthly budget and readiness deadline must all
pass. Selection prioritises earliest deadline, then least repair cost, then
request ID and condition. Stable IDs break exact ties; the data has no structured
registration timestamps, so this is not a claim of first-come-first-served.
Every candidate retains its rejection reasons. Estimates are not completed work
or credit approval. Imported assumptions are shown separately from verified history.

`identity_unknown` is an allocation warning: anonymous requests still participate
in suitability ranking, but the server rejects reservation without a known customer.
Other rejection reasons continue to exclude a candidate. Team-created sample
customer links are documented in `data/DATA.md`; they do not establish credit approval.

`second-life-selection.ts` permits an operator to select another eligible request
or target condition. Any departure from the current recommendation requires a
written reason. Identity warnings and all other eligibility failures block allocation.
The relist transaction rechecks the choice, records the reason and current recommendation
in the audit, and consumes the chosen request atomically with publishing the offer.
