# Time log: wave 1, invoices

Real clock, Helsinki. Agent: Opus, worktree `friendly-blackwell-6149aa`, base `11a3890`, limit 90 minutes.

| When             | What                                                                                                                                                                                                                                                                                                              |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-11-05 19:01 | `npm run setup`. node_modules, .env and the database were fine. The hook step failed: another session holds a lock on the shared git config, and `core.hooksPath` is an absolute path to the main checkout's `.husky/_`. The hooks still run (every commit below passed them), so I left the shared config alone. |
| 19:03            | Read the brief, `money-math.ts`, `vat.ts`, `events.ts`, the event bus, the schema and the practice repo's invoices module. No handler registration module exists yet. `CONTRACT_SIGNED` has no `signedOn` (asked Fable).                                                                                          |
| 19:06            | Tests first: `dates.test.ts`, then `dates.ts` (y/m/d integer arithmetic, no clock). 17 tests green.                                                                                                                                                                                                               |
| 19:10            | `schedule.test.ts` with cards 1, 3, 4 and the VAT boundary, then `schedule.ts`.                                                                                                                                                                                                                                   |
| 19:12            | Balance: checked both conventions against the pack. Arrears lands within cents; in advance misses card 1 by 28 €. The brief's tolerance (1 c per 1 000 €) does not hold: card 1 drifts +11 c, card 7 −276 c. Derived a tolerance from the roundings and documented it.                                            |
| 19:15            | `balance.ts`, `status.ts` and the property tests (2 000 runs each, 60 s timeout). 55 domain tests green. Two commits.                                                                                                                                                                                             |
| 19:20            | `invoices.ts`, `invoice-handlers.ts` and `event-handlers.ts`, with tests on `createTestDb()` and a card 1 fixture. 11 tests green. Commit.                                                                                                                                                                        |
| 19:27            | Route rows, the two routes (customer or admin only, the day from `todayForRequest()`), `npm run openapi`, `invoice.*` keys in four languages, `firstVatChange`, `invoice-table.tsx`. Typecheck and lint clean. Commit.                                                                                            |
| 19:32            | Docs: `docs/features/invoicing.md`, README "Features" and "Invoices", the D2–D5 and D14 statuses. `npm run check:all`.                                                                                                                                                                                            |
| 19:40            | `npm run check:all` green: 356 tests, coverage 97.7 %, build OK. Pushed and opened the PR. Closed in about 45 minutes of the 90.                                                                                                                                                                                  |
| 19:57            | Fable: add `signedOn` to `CONTRACT_SIGNED`; done with its test, handler reads it from the event. Merged `origin/main` twice (impact, upkeep, question flow), kept both sides, regenerated `docs/openapi.json`. Branch renamed to `feat/invoices`.                                                                 |

## Choices made here (not in the brief)

- No invoice 0 when the down payment is 0.
- `signedOn` added to `CONTRACT_SIGNED` (`src/domain/events.ts`, a shared file) on Fable's decision; the handler takes it from the event.
- `src/server/event-handlers.ts` is the registration module (it did not exist). The pay route imports it; wave 2's signing service must import it too.
- `tests/helpers/invoice-fixture.ts` is a new shared test helper. It writes a quote, application and contract the way signing will.
- The amortisation tolerance is derived, not the brief's 1 c per 1 000 € (see the feature doc).

## Left undone

- No route-level tests for the two API routes. The logic under them is tested, and the access check is three lines in each route.
- The invoice table is not mounted anywhere yet; wave 2 mounts it on the contract page. It has not been rendered in a browser.
- The end-of-term drift policy (snap the last month or not) is open for wave 2.
- The impact session's handlers need their own line in `src/server/event-handlers.ts`.

Closed by the wave 2 upkeep, 2026-11-05: the task is merged; the invoice table is mounted on the contract page (#16); `contractBalanceOn` skips `cancelled` (D35, wave 2 upkeep).
