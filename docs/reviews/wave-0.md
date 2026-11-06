# Review: wave 0

Reviewer: the wave 0 upkeep session (Opus), 2026-11-05 18:45–19:30, from `main` at `4142a22`.
Scope: the three squash commits `db358de` (0a), `d096a3a` (0c), `4142a22` (0b) and the tooling commits under them.

## What was checked, for every slice

- `npm run check:all` on the base plus the actor picker: green (26 test files and 280 tests with the new badge test, the build, lint, types, file sizes, no-AI). Run again before the push.
- `tests/meta-rules.test.ts` passes: no file over 600 lines, no AI, every domain module has a test, the domain is pure, every route uses `handleRoute`, every write goes through `withAudit`.
- Message files: 82 keys in each of `en`, `fi`, `sv`, `et`, same keys.
- Read against `RULES.md` and the team rules in `AGENTS.md`: pure domain, cents, codes with params, `withAudit`, `handleRoute`, one owner per table.

## Wave 0a: schema, customer seed, actor cookie

**Built.** The wave 0 Prisma models and migration, the customer seed from `customers.json` (insert missing rows, skip existing ones), `src/server/actor.ts` (cookie, `readActor`, `resolveActor`), `POST`/`DELETE /api/actor`, the `ActorPicker` client component and the `actor.*` keys.

**Checked.** A second `npm run db:setup` (and a second `npm run setup`) seeds 0 new assets and 0 new customers, so the seed is idempotent. The actor route validates with `actorBodySchema` from the route table and answers through `ok()` / `fail()`. Mounted the picker (this PR) and checked it on `next dev` at 375 px: picking Aino Virtanen sets `lease-loop-actor`, and the header shows her selected under the translated label in all four languages, with no horizontal scroll.

## Wave 0b: domain events, event bus, route table, OpenAPI

**Built.** `src/domain/events.ts` (event payload schemas, with a fast-check property test), `src/server/events.ts` (`onEvent` / `emit` inside the `withAudit` transaction), `src/server/routes.ts`, `src/server/openapi.ts`, `docs/openapi.json` and `npm run openapi`.

**Checked.** The drift test (`routes.test.ts`) lists every `route.ts` export against the table and includes the two late rows (`POST`/`DELETE /api/actor`, `POST /api/demo/clock`); `openapi.test.ts` proves `docs/openapi.json` equals the generator's output, so the file is current. The rollback test throws in the second of two handlers and asserts the first handler's row and the audit entry are both gone (`auditLog.count() === 0`).

## Wave 0c: UI kit, demo clock, audit page, nav

**Built.** `src/components/ui/*` on the role tokens (D21), the layout with nav and language switcher, the demo page with the clock override, the audit page.

**Checked.** The demo clock cookie is read in exactly two places, each once per request: `todayForRequest()` in `src/app/[locale]/page.tsx` and `readDemoClock()` in the demo page; no domain file reads a clock; `POST /api/demo/clock` is the only endpoint that takes a date from the browser. Badge colours checked against `src/domain/statuses.ts` and `assetStatusSchema`: three contract statuses had none (fixed).

## Findings

| #   | Slice | Finding                                                                                                                                                                                               | Severity | Outcome                                                                                               |
| --- | ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ----------------------------------------------------------------------------------------------------- |
| 1   | 0c    | `statusTone` in `src/components/ui/badge.tsx` had no tone for the contract statuses `bought`, `passed_on`, `ended_early`; it used names (`bought_out`, `terminated`) that `statuses.ts` does not have | medium   | fixed here: tones added, `badge.test.ts` checks every asset, application, contract and invoice status |
| 2   | 0a    | The actor picker used raw `stone-*` / `red-*` / `white` classes, against D21 and the UI kit's "never raw colour classes"                                                                              | low      | fixed here: `Button`, `inputClasses` and role tokens                                                  |
| 3   | 0a/0c | The picker was not mounted; the header had a placeholder comment                                                                                                                                      | medium   | fixed here                                                                                            |
| 4   | 0c    | The footer still said "Starter skeleton — replace me" (`footer.skeleton`)                                                                                                                             | low      | fixed here: `footer.note`, a demo-data note in all four languages                                     |
| 5   | tools | `npm run setup` failed in every app-made worktree: the app writes the main checkout's absolute `.husky\_` into `config.worktree`, which overrides `.husky/_`                                          | medium   | fixed here: setup sets `git config --worktree core.hooksPath .husky/_` when hooks are not active      |
| 6   | 0a    | No handler test for `/api/actor` (it imports the app's `db`)                                                                                                                                          | low      | handed to owner (Open)                                                                                |
| 7   | 0b    | Event handlers register at import time; a slice whose handler module is never imported silently does not react                                                                                        | high     | handed to owner (Open)                                                                                |
| 8   | 0b    | `src/server/routes.ts` (129 lines) will pass 600 lines as slices add schemas                                                                                                                          | low      | handed to owner (Open)                                                                                |
| 9   | 0c    | Only asset statuses have `status.*` message keys; contract, invoice and application statuses have none                                                                                                | low      | handed to owners (Open): each wave 1 slice adds the keys of its statuses                              |
| 10  | 0c    | The demo clock form needs JavaScript; `?asOf=` on the demo routes (brief section 8) is not built                                                                                                      | low      | handed to owner (Open)                                                                                |
| 11  | 0c    | Dark-mode contrast of the tokens was checked by eye, not measured                                                                                                                                     | low      | handed to owner (Open)                                                                                |
| 12  | 0a    | The seed inserts missing rows only; a changed data file does not update existing rows. Seeding is not audited                                                                                         | low      | accepted: the data pack is fixed for the event, and seeding is setup, not a data change               |
| 13  | 0a/0c | The layout now calls `readActor(db)` and `listCustomers(db)` on every request (two small queries); a page that needs the actor calls `readActor` again                                                | low      | accepted: ten customers; a request-scoped cache can come later if it shows                            |
| 14  | 0b    | The 404 of `PATCH /api/assets/[id]/status` is only in the generic `default` error response of the OpenAPI file                                                                                        | low      | accepted for now; add an `errors` field to the row if per-route error codes are wanted                |

## Open (for the slice's next owner)

- **Events, `src/server/events.ts`** (#7): import every slice's handler module from one file (e.g. `src/server/event-handlers.ts`) that the emitting service imports, with a test that the registry is non-empty after that import.
- **Route table, `src/server/routes.ts`** (#8): split into `src/server/routes/<slice>.ts` before it reaches 600 lines.
- **Actor route, `src/app/api/actor/route.ts`** (#6): a handler test against the test database (unknown id → 404, admin → cookie set, DELETE → cleared).
- **Status labels, `src/i18n/messages/*.json`** (#9): each wave 1 slice adds `status.<value>` for the statuses it shows, in all four files.
- **Demo page, `src/app/[locale]/demo/page.tsx`** (#10): a no-JS form post with a 303, and `?asOf=` if the demo script needs it.
- **Tokens, `src/app/globals.css`** (#11): measure dark-mode contrast for every `-ink` on `-soft` pair.

## Decisions touched

D17 (the actor) and D20 (npm stays) are implemented as proposed; their status is updated in `docs/decisions.md`. D10's four statuses exist in `statuses.ts`, but its demo-page part is not built, so it stays proposed.
