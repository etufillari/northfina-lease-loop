# User portal: time log

Branch `feat/user-portal` from `main` at `b7817d1`, slot `vigorous-pare-5aac81`. Real clock (Helsinki).

- 06:21 base check (`main` = `b7817d1`), branch renamed, `npm run setup` and `npm run db:setup` in the background; read the leases page, the invoices and exits servers, the invoicing status and the exit plan's gate.
- 06:23 `src/domain/portal/`: `groupInvoices` and `endOfTermChoices`, tests first on cards 1 and 8 (the exit invoice is due on the exit day, corrected in the test). Commit `1da1abb`.
- 06:26 `listCustomerInvoices` in `src/server/invoices.ts` through `listContracts`, two tests on the migrated database.
- 06:27 to 06:30 the page: rows moved to `rows.tsx`, `portal.tsx` and `portal-data.ts`, `/customers/[id]`, the message keys in four files, `id="exit"` on the exit card. Typecheck and lint clean.
- 06:31 checked on the dev server: admin, Aino, Olavi on Aino's page, an unknown id, 375 px.
- 06:33 to 06:40 D75 (kept to the table's widths), `docs/features/user-portal.md`, the old page's pointer, the README Features line.
- 06:41 to 06:50 `npm run check:all` green (133 files, 1 516 tests, build).
- 06:51 coordinator's notes: wave 3 review finding 8 fixed ("Applied on" relabelled "Decided on" in the four files, it prints the decision day); `listCustomerInvoices` moved to the end of `invoices.ts` for a clean merge with `fix/authz`. Push, PR.
- 06:51 review of #59 (seven points): "The term ends on" on the last day, open and upcoming soonest first, the sums pinned against `contractBalanceOn` on card 8, the card 8 tests on the real fixture plus all-cancelled and overdue-beside-upcoming, the features README and STATUS lines, D75 decided.

## Left undone

- The Pay link opens the contract page, not one invoice (no anchor per invoice in the invoice table, which is not this slice's).
- The README Status section is the hardening agent's; the portal is not in it yet.
- The `fix/authz` session can swap the page's D26 check for `src/server/authorize.ts`; the "Decided on" line (key `leases.applied`) now lives in `src/app/[locale]/leases/rows.tsx` (moved unchanged from the page).
