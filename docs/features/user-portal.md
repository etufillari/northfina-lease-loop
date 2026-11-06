# User portal

## What it does

"My leases" is the customer's portal: everything of theirs in one place, their contracts with the ways out that apply today, their applications not signed yet and every invoice across the contracts, open ones first with the sum to pay. The admin opens the same portal for any customer at `/[locale]/customers/[id]`, linked from the customer list on "All leases" (issue #28).

## The rule

- **Who sees what.** Nobody chosen: the page asks to choose in "Continue as". A customer: their own portal at `/leases`, and `/customers/<their id>`; another customer's id answers "Only the customer themself and the admin see this page." Admin: "All leases" (every contract and application with the customer's name, then the customer list) and any customer's portal. The check is D26's (the customer themself and admin); `src/server/authorize.ts` can replace it.
- **Totals line.** Active contracts; open invoices (issued and unpaid on the request's day, overdue ones included) and their sum in integer cents; the next due day, which is the earliest due day of anything unpaid (an overdue one if there is one); "Nothing due" when nothing is unpaid.
- **Contracts** as before (newest signing first), each active one followed by its ways out today from `endOfTermChoices`: before the last day "Leave early (the term runs to …): Buy it · Give it back · Pass it on", on the last day and after it "The term ends on …. Choose: …"; before the start "The lease starts on …"; an ended contract shows nothing more (its badge says how it ended). Each label links to the contract page's exit section (`#exit`), where the amounts are previewed. No amounts in the portal.
- **Invoices** from `groupInvoices` on the request's day (`todayForRequest()`, never a browser date): **Open** (due today or overdue, newest due first, each with a Pay link to its contract page, where paying lives) with their sum; then, folded, **Coming up**, **Paid** and **Cancelled** (rents replaced by an exit's invoice, D35). The status per invoice is the invoicing slice's `invoiceStatusOn`, so the portal and the contract page agree; a payment dated after the demo clock's day counts as unpaid, as on the contract page.
- **Worked through card 1.** Aino signs `ebike-003` on 5 Nov 2026: 36 rents, none paid. On 5 Nov her portal shows one active contract, one open invoice of €134.66 (13 466 cents: 10 730 net + 2 736 VAT at 25.5 %), next due 5 November 2026, 35 coming up; the contract row reads "Leave early (the term runs to 4 November 2029): Buy it · Give it back · Pass it on". Once she pays, nothing is open and the next due day is 5 December 2026.
- **Worked through card 8.** The same contract exits early on 5 Jun 2027 after seven paid rents: seven under Paid, 29 under Cancelled, the early-exit invoice (€4 166.51, 416 651 cents, due the exit day) open; the contract row shows no choices any more.

**One card per lease.** Each contract and its ways out are one framed card: the contract row on top, a dashed strip under it with a door glyph, the label and one pill per way out. Leaving before the end of the term is shown in the danger colours ("Leave early (the term runs to …)"), the end of the term in the brand's. Each application not signed yet is a card the same way, with "Cancel application" in its strip while it can be withdrawn (D87, `ApplicationCard`); a withdrawn one is not listed.

## Decisions

D75 (the portal: what it shows and from where), D26 (who sees a customer's things), D17 (the actor), D35 (cancelled rents owe nothing), D14 and D16 (the ways out), D3 (issue and due on one day).

## Pure functions

`src/domain/portal/`:

- `groupInvoices(invoices, today)` → `{ open, overdue, upcoming, paid, cancelled, openTotalCents, overdueTotalCents, nextDueDate }`. Input: `{ id, issueDate, dueDate, grossCents, status, paidOn }[]` in any order (kept inside each group); `status` is parsed with `invoiceStatusSchema`. Throws on a status that is not an invoice status, an amount that is not whole cents or a `today` that is not a calendar day. The sums are integer additions, nothing to round.
- `endOfTermChoices(contract, today)` → `{ code: 'end_of_term' | 'early_exit', params: { modes, endDate } }`, `{ code: 'not_started', params: { startDate } }` or `{ code: 'contract_ended', params: { status } }`. The gate `planExit` applies before it plans (src/domain/exits/exit-plan.ts), without the amounts.

Server reads (each table through its owner, team rule 3):

- `listCustomerInvoices(db, { customerId })` (`src/server/invoices.ts`) → `InvoiceView[]`, newest due day first; the contracts through `listContracts`, only the Invoice table queried.
- `listContracts`, `listApplications` as before.

## Files

`src/app/[locale]/leases/page.tsx` (the customer's portal or All leases), `portal.tsx` (the portal sections), `portal-data.ts` (the reads), `rows.tsx` (the contract and application rows, moved from the page), `src/app/[locale]/customers/[id]/page.tsx` (the admin's view of one customer), `src/domain/portal/`, `listCustomerInvoices` in `src/server/invoices.ts`, `id="exit"` on the exit card in `src/components/contract-exit.tsx`, the `portal.*` keys, `leases.intro` and `leases.applied` (now "Decided on {date}": it prints the decision day, wave 3 review finding 8) in the four message files.

## Tests that pin the numbers

- `src/domain/portal/invoices.test.ts`: "card 1 on 5 Nov 2026: of the first three invoices one is open, 134.66 €, due that day", "card 1 on 5 Nov 2026, the whole schedule: still one open invoice, 35 upcoming", "card 1 paid on 5 Nov: nothing open and the next due date is 5 Dec", "card 8 after the exit on 5 Jun 2027: seven paid, 29 cancelled, the exit invoice open", overdue, a payment after today, bad input.
- `src/domain/portal/exit-choices.test.ts`: card 1 on its first day (early exit, all three modes), card 8's day, the last day and after it (end of term), before the start, after the exit (ended).
- `src/server/invoices.test.ts`: "gives Aino every invoice of her contracts, newest due first, and nobody else any", "spans every contract of the customer".
- Checked live on the dev server: as admin (All leases, the customer list, Aino's portal with four contracts, their choices, 13 open invoices), as Aino and as Olavi (their own portals; Olavi on Aino's page gets the refusal), an unknown id ("That customer was not found."), and Aino's portal at 375 px (no sideways scroll).

## Open questions

- The Pay link opens the contract page, not the invoice itself: the invoice table has no anchor per invoice yet. Paying happens there, with the Pay button on each unpaid row, upcoming ones included (invoicing).
- A company's portal links to its signatory list (D46).
- The admin's portal of a company shows the company's contracts; the signatories page stays separate (`/customers/[id]/signatories`).
- "Next due" is the earliest unpaid due day, so with an overdue invoice it is in the past; a separate "overdue since" line would be clearer.
