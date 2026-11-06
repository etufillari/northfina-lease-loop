# Fan-out briefs

Read `AGENTS.md` and `docs/DECISIONS.md` first. Setup: `git pull`, `nvm use` (Node 22 —
**never** run `npm install` with another Node: native modules break for everyone),
`npm install`, `npm run db:setup`. Start the app with `npm run dev`, or `npm run dev:fresh`
to reset the database to seed state first.

Ground rules for every session:

- Work on a short-lived feature branch (`staff-desk`, `second-life`), cut from fresh `main`.
  Push early and open a PR against this fork's `main` (`gh pr create --base main` — NOT the
  upstream repo; that PR is Friday's submission and happens once, at the end). Keep the PR
  small, rebase on `main` often (`git fetch && git rebase origin/main`), and merge as soon
  as `check:all` is green — don't let branches live longer than a few hours.
- Small conventional commits.
- Touch only your own area's files. `prisma/schema.prisma` is laptop 1's — ask that session
  for schema changes. In `src/i18n/messages/*` add only your own keys (same keys in all
  four files; a test enforces it).
- `src/domain/` is frozen: tested pure functions. Build on them, don't edit them.
- Run `npm run test` before committing, `npm run check:all` before pushing.
- The persona cookie (`persona`) is the actor for every write; the time-travel cookie
  (`asOf`) is "today" everywhere — `asOfFrom(request)` in routes, `asOfFromPage(searchParams)`
  in pages (see `src/server/as-of.ts`).

## Laptop 2 — staff desk + audit log

The staff side of the Spine. New files only: pages under `src/app/[locale]/staff/`,
routes under `src/app/api/staff/`.

1. **Manual-review queue** (scenario card 7): list applications with status
   `manual_review` (with customer, asset, decision reasons from `decision_reasons_json`).
   Approve / decline buttons → a route using `withAudit()` that sets status `approved`
   (with `hold_until` = asOf + 7 days, asset reserved — mirror what
   `submitApplication` does in `src/server/applications.ts`) or `declined` (release the
   reservation, asset back to `available`).
2. **Sign as signatory** (scenario card 6): list `awaiting_signature` applications with
   their `signatory_email`; a "sign as signatory" button that POSTs the existing
   `/api/applications/:id/sign` with the signatory's email as `actor` — the audit log then
   shows who signed.
3. **Audit log page** at `/[locale]/staff/audit`: render `listAuditLog` from
   `src/server/audit.ts` (newest first, show actor, action, entity, details). Judges love
   this page — make it readable.
4. Strings in all four locale files, keys prefixed `staff.`.

Done when: card 7 (Haapala) can be approved from the queue, card 6 (Norvi) can be
signed by the signatory, and both actions appear on the audit page.

## Laptop 3 — second-life desk + passport

The returns loop (scenario cards 9 and 10). New files only: pages under
`src/app/[locale]/second-life/` and `src/app/[locale]/assets/[id]/passport/`, routes under
`src/app/api/second-life/`.

1. **Returns desk** at `/[locale]/second-life`: list assets with status `returned`. For
   each, call the frozen domain function `secondLifeDecision` (`src/domain/second-life.ts`)
   with: the asset, its **price-list v1 price** as `originalListPriceCents`
   (`listPriceOn(priceLists, id, '2026-01-01')`), the as-of date, and curves / costs /
   demand / coefficient table from `src/data/load.ts` (waitlist from the DB via
   `listWaitlist` in `src/server/waitlist.ts` — map rows back to the SecondLifeRequest
   shape). Show the WHOLE reasoning: required refurbishment items and cost, upgrade or not
   and why, market value, new financed amount, and the per-candidate match verdicts
   (`considered`) — card 9's "who gets it and why".
2. **Execute button** → route with `withAudit()`: write AssetEvents (`refurbished`,
   `upgraded` if any), update the asset (condition after upgrade, usage 0 if the battery
   reset, status `available`), bump `previous_lives`, and when there is a winner set the
   WaitlistEntry to `offered` with `offered_asset_id` and create a Reservation
   (kind `waitlist_offer`, 7 days).
3. **Passport page** (card 10) at `/[locale]/assets/[id]/passport`: the asset's AssetEvent
   rows as a timeline (every lease, return, refurbishment across lives), plus the CO₂ line:
   `co2AvoidedKg` from `src/domain/co2.ts` with
   `remainingValueFraction = marketValueCents / v1 price` (`marketValueCents` from
   `src/domain/residual.ts`). Link to it from the asset page is laptop 1's job — just make
   the page exist.
4. Strings in all four locale files, keys prefixed `secondLife.` / `passport.`.

Done when: card 9 resolves on screen (ebike-007 → wait-02, battery + inspection, wait-13
excluded with a reason) and card 10 shows ebike-008's passport with CO₂.

## Laptop 1 (this session) — pass it on + fleet quantity

Mid-lease transfer links, end-of-term nomination, the quantity selector for card 6
(4 × ebike-004), and the final scenario-card QA pass. Owns `prisma/schema.prisma`,
`src/components/`, the customer-facing pages.
