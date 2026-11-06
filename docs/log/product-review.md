# Time log: the whole-product review before submission

Real clock, Helsinki. Review session: Opus, in its own worktree, on `review/product` cut from `main` at `b7817d1`. Read-only: the only files written are this log and `docs/reviews/product-review.md`. Time box 90 minutes.

| When             | What                                                                                                                                                                                                  |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-11-06 06:24 | Base check (`origin/main` = `HEAD` = `b7817d1`), branch renamed to `review/product`, `npm run setup` (49 s), `npm run db:setup`.                                                                      |
| 06:26            | Baseline `timeout 600 npx vitest run` in the background: 130 files, 1 497 tests, green. Two read-only helper agents started: the data-pack traps, and the pages with a counted message-key script.    |
| 06:27            | Money and dates: `money-math.ts`, `vat.ts`, `pricing/quote.ts`, `invoicing/{dates,schedule,balance}.ts`, `exits/{early-exit,exit-plan}.ts`, `residual/{age,market-value}.ts`, the server's exit path. |
| 06:29            | Finding 1 found (the exit of a relisted item values it from its second-life price); a `tsx` probe, deleted after, puts it at 764,30 €.                                                                |
| 06:30            | Rule greps: owner reads, `db` inside `withAudit` (0), D23 literals, raw errors, browser dates. Races: signing, decision, payment, exit, assessment, demo card. The audit chain and its verifier.      |
| 06:33            | The pages agent's report checked against the code (three of its medium items confirmed by reading the lines).                                                                                         |
| 06:34            | The traps agent's report checked against the code (the exit's reported condition, the admin status change, the farm service hours).                                                                   |
| 06:36            | `docs/reviews/product-review.md` written: 14 findings (1 high, 5 medium), prettier, commit, push, PR.                                                                                                 |

## Blocked

Nothing.

## Left undone

- No browser check: every page finding is from the code.
- The findings are not fixed here (a docs-only PR by the brief); each names its fix for the code round.
