# Review: wave 2

Reviewer: the wave 2 upkeep session (Opus), 2026-11-05 22:33–23:40 (machine clock), on `chore/wave2-upkeep` from `main` at `c7a2dfa` plus Panu's open `origin/feat/catalogue-page` (with #19 inside it); both PRs were squash-merged during the review (`d9fc09c`, `a271bca`) and `main` was merged in again. Thomas's question-flow validation (`#25`, `1b2e46a`, D37 to D40) landed at the end and was merged in too; it is not reviewed here, and the upkeep's own new decisions moved to D41 and D42, and to D44 and D45 when #32 and #33 took D41 to D43.
Scope: contracts (`#16`), Thomas's row schemas (`#18`), Thomas's fix for a simultaneous second decision (`#22`), exits (`#20`) and the audit chain (`#21`); a "Pending" section for Panu's `#19` and `#23`, which merged while this ran.

## What was checked, for every slice

- `npm run check:all` on the merge of Panu's branches before any change: green. Green again on the branch head after merging `main` at `a271bca`: 97 test files, 981 tests, 11 todo, coverage, the build. One run had `src/server/exits.test.ts` "a buy on the last day" time out at 5 s under the coverage run on Windows (it passes alone in 7 s and on the rerun); handed to the hardening session with the `civil-days` sweep, which has the same symptom.
- `tests/meta-rules.test.ts` passes: no file over 600 lines, no AI, every domain module has a test, the domain is pure (`createHash` from `node:crypto` is the one allowed import, D36), every route uses `handleRoute`, every write goes through `withAudit`, no `AuditLog` update or delete.
- Domain purity by grep over `src/domain/` outside the scenario harness: no `Date.now`, no `new Date(`, no `Math.random`, no `fetch`, no import from `@/server` or Prisma (the six hits for "prisma" are comments naming `prisma/schema.prisma`).
- Money: the new money code rounds through `src/domain/money-math.ts` (`splitVat` for the exit invoices), except the market value, which had its own BigInt half-up (finding 6, fixed). `Math.floor` / `Math.ceil` in `residual/` and `refurbishment/` count whole usage steps and blocks; `Math.round` in `market-value.ts` rounds a display percentage, not money.
- Outcomes: every refusal of `planContract` / `signContract` has a `contract.refusal.<code>` key, every refusal of `planExit` / `exitContract` an `exit.refusal.<code>` key, every exit line code an `exit.line.<code>` key. The four message files have the same keys (checked after each merge).
- Routes: every `route.ts` has its row in `src/server/routes.ts`; `docs/openapi.json` regenerated after each merge and after the status route's body changed (19 paths), pinned by `openapi.test.ts`.
- One owner per table: every `db.<table>` / `tx.<table>` under `src/server/` and `src/app/` listed (`grep -rnoE "\b(db|tx)\.(asset|customer|quote|application|contract|invoice|assetEvent|returnAssessment|auditLog)\b"`). Each file touches only its own table, with three exceptions: `invoices.ts` → `Contract` (wave 1 finding 3, fixed here: finding 1), `actor.ts` → `Customer` (the base slice reading the ids for the cookie check, accepted in the wave 1 review) and `catalogue-handlers.ts` → `Asset`, which is the catalogue's own module, called by signing on its `tx`. Nothing under `src/app/` queries a table.
- Events: `CONTRACT_SIGNED` (signing), `CONTRACT_BOUGHT_OUT`, `UNIT_RETURNED`, `UNIT_PASSED_ON` (exits) are emitted with the `tx` of `withAudit`, after the guarded write. The owners handle them: invoicing writes the schedule, the exit invoice and the cancellations (`invoice-handlers.ts`), the catalogue sets `sold` / `returned` (`catalogue-handlers.ts`), the passport writes its row (`passport-handlers.ts`). All registered from `src/server/event-handlers.ts`.
- Feature pages against `docs/features/README.md`: every page has the seven sections in order; the claims below were read against the code on the branch.

## Contracts (`#16`)

**Built.** `src/domain/contracts/` (`planContract`, `priceLockOf`, `contractNumber`), `src/server/contracts.ts` (`signContract`, `getContract`, `contractCustomerId`, `getContractDetails`, and since `#20` `endContract`), `POST /api/contracts`, `GET /api/contracts/[id]`, the contract page with `InvoiceTable` and the price-lock explanation.

**Checked.** Signing copies the quote and never re-prices (no rounding in the slice). The last-unit race is `leaseAvailableAsset`'s conditional `updateMany` on the signing `tx`; a lost race rolls back the contract, the invoices, the passport row and the audit row (`contracts.test.ts`, sequential and `Promise.all`). The actor is the cookie's. The start cap was 90 days, an open question on the page; Johannes decided one year, so it is now `addMonthsClamped(signedOn, 12)` with a leap-day test (finding 2, D45). The page said invoicing still read the `Contract` table; true until finding 1.

## Row schemas (`#18`, Thomas)

**Built.** A strict Zod write schema per stored row in `src/domain/rows/`, parsed with `parseRow()` (`src/server/row-rules.ts`) before every guarded write, `tests/schema-columns.test.ts` holding them to `prisma/schema.prisma` (D27).

**Checked against our posted review** ([the review on #18](https://github.com/ThomasParratt/northfina-lease-loop/pull/18)): Thomas fixed every finding before merging.

| #   | Our finding on #18                                                                   | Now on `main`                                                                                                              |
| --- | ------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| 1   | A row-schema failure answered 400 `VALIDATION_ERROR` with column names               | fixed: `parseRow` throws `RowRuleError`, answered as 500 `INTERNAL_ERROR` (`row-rules.test.ts`, "becomes a generic 500")   |
| 2   | Two tests passed for the wrong reason (the entry check threw before the transaction) | fixed: `invoices.test.ts` uses `invoice.rescheduled`; `audit.test.ts` breaks the audit write with a `BigInt` inside the tx |
| 3   | The D27 cell re-padded the whole decisions table                                     | fixed: D27 fits the widths                                                                                                 |
| 4   | D28 / D29 without chosen-against, D28's reason stale                                 | fixed                                                                                                                      |
| 5   | D28's `@unique` clashes with D8                                                      | fixed: D28 stays proposed, dependent on D8                                                                                 |
| 6   | The page claimed "every row"                                                         | fixed: the page names the guarded models                                                                                   |
| 7   | `localeSchema` used only by its test                                                 | fixed: removed                                                                                                             |
| 8   | No STATUS row                                                                        | fixed here: the row is in `docs/features/STATUS.md`                                                                        |

## Simultaneous second decision (`#22`, Thomas)

**Built.** `decideApplication` writes with `updateMany where { id, decision: <the state read> }` and needs exactly one row changed; a lost race answers 409 `APPLICATION_NOT_PENDING` and rolls back its audit row.

**Checked.** `applications.test.ts` decides one case twice with `Promise.all`: one wins, the other writes nothing. The same pattern as paying an invoice and signing. The question-flow page documents it.

## Exits (`#20`)

**Built.** `src/domain/exits/` (`planExit`, the D14 early exit line by line, `exitBilling`), `src/domain/residual/` (market value by the curve, `curveAgeInMonths` for D31), `src/domain/refurbishment/plan.ts`, `src/server/exits.ts` with `exit-data.ts`, `POST /api/contracts/[id]/exit` and `GET …/exit-preview`, the exit section on the contract page, a `cancelled` invoice status, `catalogue-handlers.ts` for `sold` / `returned`.

**Checked.** Reads of other slices go through their owners (`getContract`, `getAsset`, `listInvoices`, `getCustomer`), and the contract is ended through the contract slice's `endContract` on the exit's `tx`, which parses the row and writes only while `active`; a second exit is refused with nothing written. VAT through `splitVat`; the market value had a second half-up function (finding 6). Card 8 by D31 (provisional): buy 330 675, return 75 945 as good and 23 975 as new; the D11 numbers (202 523, 243 125) are pinned as chosen against. D32 to D35 were proposed although the code implements them (finding 4); D35 asked invoicing to skip `cancelled` in `contractBalanceOn` (finding 3). `STATUS.md` still quoted the pre-D31 numbers (finding 9).

## Audit chain (`#21`)

**Built.** `src/domain/audit/` (`canonicalJson`, the chain hash, the verifier), hashing in `withAudit` inside the change's transaction, `prev_hash` and `hash` unique, `GET /api/audit-log/verify`, the badge on the audit page, `npm run demo:tamper`, the append-only meta rule (D36).

**Checked.** The hash covers the actor, action, entity, details and `created_at`, so editing any of them breaks the chain at that row; a null hash anywhere is a break, so nulling every hash cannot pass as intact. The verify route is open to every actor, like the audit log itself (D21: the page is not gated; only the link is admin's). The D36 row in `docs/decisions.md` was cut at a bare `|` inside its code span, so the decision ended mid-sentence and had no reason or status (finding 5).

## Cross-cutting

- The wave 1 findings still open at the start: 3 (invoicing reads `Contract`), 5 (the status route), 7 (the apply page) and 8 (no statuses section). All fixed here (findings 1, 7, 8, 10).
- Owners' read functions that took only `PrismaClient` (`getApplication`, `listAssets`, `listAssetEvents`, `getCustomer`, `listCustomers`, `getQuote`) now take `PrismaClient | TransactionClient`, like `getContract`, `getAsset` and `listInvoices`, so another slice can read inside its own transaction without a cast; `grep -rn "as PrismaClient\|readerOf" src` finds none (finding 11).

## Findings

| #   | Slice            | Finding                                                                                                                                                   | Severity | Outcome                                                                                                                                                          |
| --- | ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | invoicing        | `invoiceCustomerId` / `contractCustomerId` in `src/server/invoices.ts` read the `Contract` table (wave 1 finding 3)                                       | medium   | fixed here: the invoice row is read, the customer through `contracts.ts`'s `contractCustomerId` (re-exported); a test pins that it is the owner's function       |
| 2   | contracts        | The start cap was 90 days, ours and undecided; Johannes decided one year                                                                                  | medium   | fixed here: `START_MONTHS_MAX = 12` with `addMonthsClamped`, `start_too_far { maxStartDate, maxMonths }`, four message files, a 29 February test, D45            |
| 3   | invoicing, exits | `contractBalanceOn` counted a `cancelled` rent as open (D35)                                                                                              | medium   | fixed here: skipped, with a test; D35 decided                                                                                                                    |
| 4   | decisions        | D32 to D35 proposed although `#20` implements them; D11, D14, D16, D25, D27–D29 statuses stale or without a date                                          | low      | fixed here                                                                                                                                                       |
| 5   | audit chain      | D36 in `docs/decisions.md` was truncated at a bare `\|` inside a code span: no reason, no status                                                          | medium   | fixed here: rewritten whole from `docs/features/audit-chain.md`, cells within the widths                                                                         |
| 6   | exits            | `market-value.ts` had its own BigInt half-up, against one rounding function (D1, team rule 5)                                                             | low      | fixed here: `roundHalfUpDivBig` in `money-math.ts` beside `roundHalfUpDiv`, with tests; card 8 unchanged                                                         |
| 7   | catalogue        | `PATCH /api/assets/[id]/status` took the actor from the body and allowed any move (wave 1 finding 5); its old status was read outside the transaction     | medium   | fixed here: actor from the cookie, admin only (403), D22's moves in `src/domain/catalogue/transitions.ts` (409 with `from` / `to`), update conditional on status |
| 8   | question flow    | The apply page asked every question for an expired quote (wave 1 finding 7)                                                                               | low      | fixed here: `quote.expiredNotice` and a link to a new quote instead of the questions; checked on a dev server on 2026-11-05 and 2026-11-25                       |
| 9   | STATUS           | `docs/features/STATUS.md` had pre-D31 exits numbers, no row-schemas or `#22` row, and the upkeep and hardening rows as "missing"                          | low      | fixed here                                                                                                                                                       |
| 10  | catalogue        | No asset-statuses section in `catalogue.md` (wave 1 finding 8)                                                                                            | low      | fixed here: the statuses, the moves, who sets each, the admin route, a worked example                                                                            |
| 11  | all              | Six owner reads took only `PrismaClient`                                                                                                                  | low      | fixed here: `PrismaClient \| TransactionClient`, a transaction-client test on `getQuote`                                                                         |
| 12  | docs             | `exits.md`, `invoicing.md`, `circular-impact.md` said `cancelled` was not handled and nothing emitted events; `contracts.md` had the 90-day open question | low      | fixed here                                                                                                                                                       |
| 13  | docs             | Stale "Tests that pin the numbers" lines: `contracts.md` "the 90-day boundary"; the new transition and D35 tests are not listed                           | low      | handed to owner (Open): the hardening session owns those lines (note in the shared notes folder)                                                                 |
| 14  | tests            | `exits.test.ts` "a buy on the last day" timed out once at 5 s under the Windows coverage run                                                              | low      | handed to owner (Open): the hardening session (`testTimeout` or a per-test limit)                                                                                |
| 15  | README           | The README had grown to 195 lines: 58 lines of team notes, a Features list of paragraphs                                                                  | low      | fixed here: the notes in `docs/team-notes.md`, one link per page, `tests/readme-original.test.ts` guards the organiser's lines                                   |

## Pending: Panu's `#19` and `#23`

Both were open when this review started and were squash-merged during it (`d9fc09c`, `a271bca`); their findings are Panu's and were not fixed here.

- `#19`, the new look (D21 revised, `docs/features/look.md`): [our review](https://github.com/ThomasParratt/northfina-lease-loop/pull/19#pullrequestreview-5790982952) (one high: the focus colour on the staff strip; two medium: clipping). The PR's STATUS row lists the fixes (focus ring on the strip, stamp sizes, life colours, 3:1 input borders); not re-verified in a browser here.
- `#23`, the landing and catalogue pages and `financeOffer`: [our review](https://github.com/ThomasParratt/northfina-lease-loop/pull/23#pullrequestreview-5791624494). Its apply-page change (the price shown as locked only while the quote is valid) is kept; finding 8 adds the expired notice in front of it.
- `#25` (Thomas, `1b2e46a`), the question-flow validation, merged at the end of this review and is not reviewed here. Its four rules took D37 to D40 (its branch called them D35 to D38, renumbered on merge): D37 a birth date is an answer only within 120 years before today; D38 answers that differ from the customer record hold the case for `manual_review`; D39 only the named signatory signs or declines for a company; D40 only the acting customer applies, in their own name. The wave 3 review covers it.
- The phone check of every page at 375 px (Johannes's TODO after `#19`) is still to do: the wave 2 hardening brief carries it.
