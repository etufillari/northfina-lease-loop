# Time log: the application decision race

Real clock, Helsinki. Coding agent: Opus, in the main checkout, branch `fix/decision-race` cut from `origin/main`.

| When             | What                                                                                                                                                                                                                                                               |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 2026-11-05 21:53 | Start. An idempotency and concurrency survey found `decideApplication` checking the pending state outside the transaction and writing with a plain `update`: two simultaneous decisions both succeed, the second overwrites the first and adds a second audit row. |
| 21:54            | Test first: "two decisions at the same instant" (`Promise.all`, approve and reject) in `applications.test.ts`. It failed as expected (2 successes). The shell's Node 24 cannot load `better-sqlite3` built for 22; ran on the pinned Node 22 (`.nvmrc`).           |
| 21:57            | Fix: `updateMany where { id, decision: current.decision }`, throw `LostDecisionRace` on 0 rows inside `withAudit` so the audit row rolls back, answer `not_pending`. Same pattern as `payInvoice`. 17/17 green. Feature page `question-flow.md` updated.           |
| 22:02            | `check:all` green on Node 22: 80 files, 832 tests, 98.4 % lines, the build. Committed.                                                                                                                                                                             |

## Left undone

- Duplicate applications on a double-submit (`quote_id` is not unique) and the stale `from` in the asset-status audit: judged not worth code (see the open questions in the feature pages).

Closed by the wave 2 upkeep, 2026-11-05: the task is merged; the stale `from` in the asset-status audit is gone (the update is now conditional on the checked status, wave 2 upkeep); the double-submit stays in `docs/features/question-flow.md`.
