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
| `money.ts`       | The rounding rule, rate conversions, and euro formatting for the UI.     |
| `calendar.ts`    | Month arithmetic on ISO dates, safe for month ends and leap years.       |
| `vat.ts`         | The VAT rate on a date, and the VAT of one invoice.                      |
| `pricing.ts`     | Rent, buyout and contract total for a net price or a catalogue item.     |
| `contract.ts`    | The price-lock rule, and the snapshot that signing makes.                |
| `invoicing.ts`   | The invoice schedule, totals, VAT-change notes and cost forecast.        |

## Pricing and invoicing rules

These are design decisions, so they are written down here and tested. All of them are general
rules: nothing is specific to a scenario card.

| Topic          | Rule                                                                                                                                                                          |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Rounding       | Half up, once, per amount, using whole-number rates (`roundHalfUp`). No floats touch money.                                                                                   |
| Rent           | `round(financed × factor)` is one locked integer. Every rent invoice has exactly this net amount.                                                                             |
| Contract total | `down payment + term × rent`, net, fixed at signing. The buyout is optional and is not part of it.                                                                            |
| Rounding gap   | Rounding the rent can differ from the unrounded total by up to `term ÷ 2` cents. The rounded rent is the agreed price, so nothing is corrected later.                         |
| VAT            | Rounded per invoice at the rate on the invoice date. The gross total is the sum of the invoices.                                                                              |
| Down payment   | Net, so it is its own invoice (sequence 0) on the start date, with VAT added. The data pack does not define this: it is our assumption.                                       |
| Billing        | Monthly in advance. Every period is a full contract month from the start date, so nothing is prorated.                                                                        |
| Dates          | Counted from the start date and clamped to the month end: 31 Jan, 28 Feb, 31 Mar. Never from the previous invoice.                                                            |
| Due date       | The invoice date. It does not move for weekends, as the data pack has no bank-holiday calendar.                                                                               |
| Price lock     | A quote is not binding. The price list on the signing day decides, and if that differs from what the customer accepted, nothing is signed until they confirm the new figures. |
| Second life    | Same calculation, from an assessed net price instead of a list price. No price list can change it.                                                                            |

Structured reason codes: `below_minimum`, `above_maximum`, `unknown_term`,
`down_payment_exceeds_price`, `unknown_asset`, `no_price_list_on_date`, `no_vat_rate_on_date`,
`signed_before_quote`, `start_before_signing`, `price_changed`, and on the contract
`price_unchanged_since_quote` or `list_price_changed_since_quote`. The API sends them in upper case
as `error.code`; `src/server/pricing-data.ts` has the full list.

## What teams are expected to add

Create these as you need them. Do not commit empty files.

- `question-flow`: which question to ask next, from `data/questions.json`, and what happens
  to answers that stop applying.
- `end-of-term`: return, buy out or extend, and the value of the returned item.
- `second-life`: refurbishment cost, matching a returned item to the waiting list, CO2 saved.
