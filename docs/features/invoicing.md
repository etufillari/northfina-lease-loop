# Invoicing: the schedule, VAT by invoice date, the balance

Smart problems 1 ("Lock the price, not the tax") and 5 ("Money that adds up"); scenario cards 1, 3, 4 and 8. Wave 1, base `11a3890`.

## What it does

When a contract is signed, its whole invoice schedule is written in the same transaction:

- invoice 0 for the down payment, if there is one;
- one rent invoice for each month of the term.

The net rent is locked at signing. Each invoice charges VAT at the rate in force on its own issue date, so a contract that runs across 1 January 2027 moves from 25.5 % to 26 % without anyone repricing it.

A customer (or admin) can list a contract's invoices and pay one. Paying writes the audit row and emits `INVOICE_PAID`. A payment is refused with a code, writing nothing, when the invoice is `cancelled` (409 `INVOICE_CANCELLED`, after an early exit), already paid (409 `INVOICE_ALREADY_PAID`) or dated before the contract was signed (422 `PAID_BEFORE_SIGNING`, the demo clock moved back); the day and both statuses are parsed before the write (D23, product review 9). The invoice table shows each invoice's status on the request's day, with one line explaining the VAT change, and a "Pay" button on every unpaid invoice, upcoming ones included since paying early is an advance payment (`src/components/pay-invoice-button.tsx`): it posts to the pay route with no body and reloads the page; a refusal is written from the message files (`invoice.pay.refusal.*`, or `authz.refusal.*` from `details.code`) by `payRefusalText` (`src/components/pay-refusal.ts`).

For an early exit, the outstanding balance after any number of rents comes month by month: the financed amount amortised at the band's interest rate.

## The rule, with the worked examples

**The schedule (D3, D4).** Rent invoice _n_ (1 … term) covers the full month from `start + (n − 1) months` to the day before `start + n months`. When the start day doesn't exist in a month, it moves to that month's last day. The clamp always counts from the original start day, so it never accumulates. Each invoice is billed in advance: issued and due on the first day of its period. There is no proration.

**The down payment (D5).** Invoice 0 is issued and due on the signing day, at that day's rate. **When the down payment is 0, there is no invoice 0.** A 0,00 € invoice is noise to the customer, and every sum invariant holds either way. The sequences are then 1 … term; with a down payment they are 0 … term.

**VAT (D2, D1).** Rate = `vatRateOn(vat-rates.json, issueDate)`. VAT is rounded half up per line from the net (`splitVat`), and gross = net + VAT. A day with no rate in the table is a value (`no_vat_rate_on_date`, with the day), not a crash. The signing handler turns it into a rollback.

| Card                                        | Invoice                      | Net    | Rate   | VAT   | Gross  |
| ------------------------------------------- | ---------------------------- | ------ | ------ | ----- | ------ |
| 1 · `ebike-003`, 36 months from 2026-11-05  | 1 · 2026-11-05 → 2026-12-04  | 10 730 | 25.5 % | 2 736 | 13 466 |
|                                             | 2 · 2026-12-05 → 2027-01-04  | 10 730 | 25.5 % | 2 736 | 13 466 |
|                                             | 3 · 2027-01-05 → 2027-02-04  | 10 730 | 26 %   | 2 790 | 13 520 |
| 3 · `ebike-001`, 24 months from 2026-09-15  | 4 · issued 2026-12-15        | 6 957  | 25.5 % | 1 774 | 8 731  |
|                                             | 5 · issued 2027-01-15        | 6 957  | 26 %   | 1 809 | 8 766  |
| 4 · `laptop-001`, 36 months from 2026-01-31 | 2 · due 2026-02-28           | 3 432  |        |       |        |
|                                             | 26 · due 2028-02-29          | 3 432  |        |       |        |
|                                             | 36 · 2028-12-31 → 2029-01-30 | 3 432  |        |       |        |
| Boundary                                    | issued 2027-01-01            |        | 26 %   |       |        |
|                                             | issued 2026-12-31            |        | 25.5 % |       |        |

**The balance (D14).** Each month: interest = `balance × annual basis points / 120 000`, rounded half up (away from zero) once; then the balance is `balance + interest − monthly net rent`. Interest accrues on the balance before that month's rent is subtracted. This is the convention the pack's factors reproduce. The in-advance convention misses card 1's buyout by 28 €.

Card 8 (card 1 after 7 rents): financed 389 000, band B 7.9 %.

| Month | Opening | Interest | Rent   | Closing     |
| ----- | ------- | -------- | ------ | ----------- |
| 1     | 389 000 | 2 561    | 10 730 | 380 831     |
| …     |         |          |        |             |
| 7     |         |          |        | **330 675** |

The balance after 7 rents is **330 675**. For comparison, the 29 remaining rents (311 170) plus the buyout (58 350) come to 369 520. The difference is interest not yet earned, which an early exit does not charge.

**The drift at the end of the term, reported honestly.** The brief asked for the end-of-term balance to land within 1 cent per 1 000 € financed. **The real pack cannot meet that tolerance:**

| Contract                                  | End balance | Buyout    | Drift  | 1 c / 1 000 € allowance |
| ----------------------------------------- | ----------- | --------- | ------ | ----------------------- |
| Card 1, 389 000 financed, 36 months, B    | 58 361      | 58 350    | +11 c  | 3.9 c                   |
| Card 7, 12 500 000 financed, 48 months, D | 999 724     | 1 000 000 | −276 c | 125 c                   |

Three things cause the drift. The pack rounds each factor to six decimals (±0.5 millionths of the financed amount a month). The rent is rounded to the cent (±0.5 c a month). Each month's interest is rounded (±0.5 c a month). All three compound over the term. Even with an unrounded rent, the pack's factors miss their own buyout by up to about 25 cents per 10 000 € (band A, 48 months).

The tests therefore use a derived bound, `amortisationTolerance(financed, term)`: the cent roundings, at `term × 2` cents, plus the factor rounding, at `ceil(financed × term × 2 / 2 000 000)` cents. The 2 bounds the growth `(1 + r)^term` for every band and term in the pack. That gives 87 c for card 1 and 696 c for card 7. Wave 2 decides how to treat the drift: charge the computed balance, or snap the last month to the buyout. Snapping is safe because the drift is well under a cent per month.

## Decisions

D1 (rounding), D2 (VAT on the invoice date), D3 (the schedule, billed in advance, day clamped), D4 (full first month), D5 (the down payment is invoice 0): implemented as proposed. D14: the balance is here; the exit itself (buy and return) is [exits.md](exits.md). D35: a `cancelled` invoice (an early exit replaced it) owes nothing and is left out of `contractBalanceOn`. See [docs/decisions.md](../decisions.md).

Choices made in this wave, beyond the brief:

- No invoice 0 when the down payment is 0 (above).
- **`CONTRACT_SIGNED` carries `signedOn`** (added in this wave, as Fable decided): the signing day and the start day differ by design (D5, D7), and the handler dates invoice 0 from the event, without reading the contract row.
- The display status is derived and never stored: `upcoming` before the issue day, `due` from issue to due, `overdue` after, `paid` once paid.
- The pay route takes no body. The day is `todayForRequest()` and the actor is the cookie. Only the contract's customer or admin may list or pay; anyone else gets 403.
- Paying early is allowed (it is an advance payment). Paying twice answers 409 `INVOICE_ALREADY_PAID`; a lost race rolls back without an audit row.

## Pure functions

```ts
// src/domain/invoicing (index.ts)
addMonthsClamped(isoDate: string, months: number): string
addDays(isoDate: string, days: number): string   // re-exported from src/domain/civil-days.ts, shared with pricing
daysInMonth(year: number, month: number): number
compareIso(a: string, b: string): -1 | 0 | 1
termEndDate(startDate: string, termMonths: number): string   // the CONTRACT_SIGNED endDate
buildSchedule({ signedOn, startDate, termMonths, downPaymentCents, monthlyNetCents, vatRates })
  : { ok: true; invoices: ScheduledInvoice[] } | { ok: false; reason: 'no_vat_rate_on_date'; date }
scheduleTotals(invoices): { netCents; vatCents; grossCents }
rentPeriod(startDate, sequence): { periodStart; periodEnd }
firstVatChange(invoices, vatRates): { oldRateBasisPoints; newRateBasisPoints; lastOldDay; firstNewDay } | null
outstandingBalanceAfter({ financedCents, annualInterestPercent, monthlyNetCents, termMonths, buyoutCents }, monthsPaid)
  : { balanceCents; endOfTermBalanceCents; driftCents; rows: AmortisationRow[] }
amortisationSchedule(input): AmortisationRow[]   // { month, openingCents, interestCents, paymentCents, closingCents }
amortisationTolerance(financedCents, termMonths): number
invoiceStatusOn({ issueDate, dueDate, paidOn }, today): 'paid' | 'due' | 'overdue' | 'upcoming'
contractBalanceOn(invoices /* status 'cancelled' skipped (D35) */, payments: Record<id, paidOn>, today)
  : { openCents; overdueCents; upcomingCents; paidCents; openInvoiceIds; overdueInvoiceIds }

// src/server/invoices.ts
writeSchedule(tx, contractId, invoices: ScheduledInvoice[]): Promise<number>
listInvoices(db, contractId): Promise<InvoiceView[]>
payInvoice(db, { id, paidOn, actor }): Promise<{ ok: true; invoice } | { ok: false; reason: 'not_found' | 'already_paid' }>
invoiceCustomerId(db, invoiceId): Promise<string | null>   // the contract read through contracts.ts
contractCustomerId                                       // re-exported from src/server/contracts.ts

// src/server/invoice-handlers.ts — registered on CONTRACT_SIGNED via src/server/event-handlers.ts
handleContractSigned(tx, event, vatRates?): Promise<number>   // event.signedOn dates invoice 0

// src/components/invoice-table.tsx (server component)
<InvoiceTable contractId today locale t />
```

## Files

- `src/domain/invoicing/`: `dates.ts`, `schedule.ts`, `balance.ts`, `status.ts`, `index.ts`, each with a `.test.ts`, plus `schedule.property.test.ts`.
- `src/server/invoices.ts`, `src/server/invoice-handlers.ts` and their tests; `src/server/event-handlers.ts`, the registration module (one import line per slice).
- `src/app/api/invoices/route.ts`, `src/app/api/invoices/[id]/pay/route.ts`; their rows in `src/server/routes.ts`; `docs/openapi.json`.
- `src/components/invoice-table.tsx`, `src/components/pay-invoice-button.tsx`, `src/components/pay-refusal.ts` with its test; `invoice.*` keys in the four message files.
- `tests/helpers/invoice-fixture.ts`: a card 1 contract row (with its quote and application) for the server tests.

## Tests that pin the numbers

- `dates.test.ts`: 31 Jan + 1 → 28 Feb 2026, + 25 → 29 Feb 2028, + 2 → 31 Mar; leap years 2028, 2000 yes and 2100 no; `addDays` across the leap day; `termEndDate` for cards 1 and 4.
- `schedule.test.ts`: card 1's first three invoices in full and its totals; card 3's December and January; card 4's two Februaries and its last period; the 1 Jan 2027 and 31 Dec 2026 boundary; invoice 0 on the signing day; the missing-rate answer; `firstVatChange` on card 3.
- `balance.test.ts`: card 8 = 330 675 after 7 rents, line by line; card 1's drift +11 c and card 7's −276 c, within the tolerance.
- `status.test.ts`: upcoming / due / overdue around the day; `contractBalanceOn` on card 1's first three invoices.
- `schedule.property.test.ts` (fast-check, 2 000 runs per property, 60 s timeout each). Random contracts are priced like signing: any asset in the pack, priced on any day of 2026 with the real price lists and coefficient table, terms 12/24/36/48, any down payment below the price, starts in 2025–2030 (plus a generator for starts on the 29th–31st). The properties:
  - the rent nets sum to `term × net` exactly, and gross = net + Σ per-line VAT;
  - every date is a real day, and periods are contiguous from the start;
  - a start on the 29th–31st is clamped to the month end, and a leap February gives the 29th;
  - sequences run 0 / 1 … term with no gaps;
  - each invoice's rate is the rate in force on its issue date;
  - the end-of-term balance is within `amortisationTolerance` of the buyout.
- `invoice-handlers.test.ts`, on a real SQLite database:
  - emitting `CONTRACT_SIGNED` inside `withAudit` writes card 1's 36 invoices;
  - a down payment becomes invoice 0;
  - a failing later handler rolls the invoices and the audit row back;
  - a missing contract row rolls back.
- `invoices.test.ts`: list, the unique sequence, the access lookups, pay (audited, `INVOICE_PAID` with the gross), already paid / not found, and a throwing `INVOICE_PAID` handler rolling back the payment.
- `src/components/pay-refusal.test.ts`: the three pay codes, an authorization refusal through `details.code`, `constructor` / `toString` falling back to the unknown message, and a missing body.
- `src/domain/scenarios/` (scenario harness): cards 1, 3, 4 and 8 from `priceQuote` to `buildSchedule` (486 612 total for card 1, 8 731 / 8 766, 28 Feb 2026 / 29 Feb 2028, 311 170 and 330 675), the VAT boundary and leap-day traps, and `quote-schedule.property.test.ts` (the quote total is what the invoices add up to).

## Open questions

- **A prepaid invoice paid late across a rate change.** Under D2, an invoice issued on 31 Dec 2026 and paid on 3 Jan 2027 would legally take 26 % (VAT Act section 15: an advance payment is taxed when it is received). The app keeps the invoice-date rate and says so. Fixing it would mean re-issuing the line on payment.
- **The end-of-term drift.** Charge the computed balance, or snap the last month to the buyout (above)? This is wave 2's call, with the early exit.
