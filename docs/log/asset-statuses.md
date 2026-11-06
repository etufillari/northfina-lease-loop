# Time log: the asset's leased and sold statuses, and where allowed values are checked

Real clock, Helsinki. Coding session: Opus, in the main checkout on the branch `feat/asset-lifecycle-statuses`, base `4142a22`.

| When             | What                                                                                                                                                                                                                                                                                                      |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-11-05 19:20 | Review of wave 0's schema against the brief: complete for the Spine, but what a bought-out asset becomes was never decided, and `reserved` meant both "held" (the data pack) and "leased" (the brief's `CONTRACT_SIGNED` row). Allowed values were checked only at the route and the loaders.             |
| 19:26            | Branch `feat/asset-lifecycle-statuses`. Tests first in `src/server/assets.test.ts`: `leased` and `sold` are accepted; a bad status passed straight to `changeAssetStatus` throws and writes neither the asset nor the audit row. Red as expected.                                                         |
| 19:27            | **Blocked 2 minutes:** every database test failed with `NODE_MODULE_VERSION 127 … requires 137`. The shell's default Node was 24.11.1; `node_modules` was built with 22.22.2 (`.nvmrc`). Ran everything with Node 22 on the `PATH`.                                                                       |
| 19:28            | `assetStatusSchema` gains `leased` and `sold` (D22); `changeAssetStatus` parses the status itself before the write (D23); the badge tone and `status.leased` / `status.sold` in all four message files; the schema comments. `npm run db:migrate` → in sync, no migration (a text column).                |
| 19:29            | D22 and D23 in `docs/decisions.md`; the brief's section 6 note, the `CONTRACT_SIGNED` and `CONTRACT_BOUGHT_OUT` rows of section 7, and a line on allowed values in the agent brief template (section 11); the README "Database" section; the duplicated `npm run setup` row removed. OpenAPI regenerated. |
| 19:31            | `npm run check:all` green under Node 22: 290 tests, coverage 97.8 %, the build. Closed, 11 minutes. Not committed yet.                                                                                                                                                                                    |

## Left undone

- No wave 1 brief exists yet, so the rule went into the template (section 11). Whoever writes the briefs copies it in.
- Nothing sets `leased` or `sold` yet: the catalogue's `CONTRACT_SIGNED` and `CONTRACT_BOUGHT_OUT` handlers are wave 2.
- The catalogue does not yet hide `leased` and `sold` items or stop them being quoted; the pricing slice decides that from the status (only `available` is leasable).
- `Contract` has no `signed_by` column (the signer is only in the audit log and the signatory's email in `answers_json`); left for the contract slice to raise if its page needs it.
- No meta rule checks that a write imports its schema; the agent brief template and D23 ask for it, the test of each write proves it.

Closed by the wave 2 upkeep, 2026-11-05: the task is merged; `leased` is set at signing (#16), `sold` and `returned` by the exits (#20), and the admin status route reads the actor from the cookie and checks D22's moves (wave 2 upkeep).
