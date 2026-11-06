# My leases

> Grown into the [user portal](user-portal.md) (D75, issue #28): the customer's page now also shows the totals, each contract's ways out and every invoice, and the admin opens any customer's portal at `/customers/[id]`. This page keeps the list's original rule.

## What it does

A "My leases" link in the top navigation, shown once someone is chosen in "Continue as", lists that customer's contracts (each opening its contract page, where the invoices are and the lease is ended) and their applications that are not signed yet (an approved one leads to its Sign button). Admin sees "All leases": every contract and application with the customer's name, so a demo reaches any contract in two clicks.

## The rule

- **Who sees what.** Nobody chosen: no link, and the page asks to choose in "Continue as". A customer: their own contracts and applications only (`customer_id` = the actor). Admin: everything. Every row links to a page the same actor is allowed to open (the contract page's D26 check), so no link ends in "not allowed".
- **Contracts** newest signing first, then by number; each shows the item, the status, the number, the term (start to last day) and the locked monthly rent without VAT.
- **Applications** newest first, without those that became a contract (the contract stands for them). An approved one shows "Approved" with a "Ready to sign" link; the others show their decision ("Not approved", "A person will check", "Waiting for the signatory").
- Worked through card 1: Aino signs `ebike-003` on 2026-11-05; her list shows "Nordvolt Trail 500 · Active · 5 November 2026 – 4 November 2029 · €107.30 a month without VAT", linking to the contract.

## Decisions

D26 (who sees a contract), D17 (the actor). A small part of issue #28 (the user portal): the list only, no invoice overview of its own.

## Pure functions

None new: the page reads through each table owner's function (team rule 3) and writes nothing.

- `listContracts(db, { customerId? })` (`src/server/contracts.ts`) → `ContractView[]`, newest signing first; all contracts without `customerId`.
- `listApplications(db, { customerId? })` (`src/server/applications.ts`) → `ApplicationView[]`, newest first; all without `customerId`.

## Files

`src/app/[locale]/leases/page.tsx`, `src/components/site-header.tsx` (the link), `src/server/contracts.ts`, `src/server/applications.ts`, `nav.leases*` and `leases.*` keys in the four message files.

## Tests that pin the numbers

- `src/server/contracts.test.ts`: "listContracts gives one customer their own contracts, newest first, and admin all".
- `src/server/applications.test.ts`: "listApplications gives one customer their own applications, newest first, and admin all".
- The €107.30 in the worked example is card 1's rent, pinned by pricing (`src/domain/scenarios/card-01-happy-path.test.ts`); the page only prints it.
- Checked live: as Aino (her contracts and unsigned applications), as Admin (every row with its customer), as nobody (no link, the pointer to "Continue as"), and at 375 px.

## Open questions

- An approved application whose quote has expired or whose item was leased to someone else still shows the "Ready to sign" link; the Sign button then shows the refusal (`quote_expired`, `asset_not_available`).
- The rest of #28 (invoices across contracts, a customer overview) is built: see [user-portal.md](user-portal.md).
