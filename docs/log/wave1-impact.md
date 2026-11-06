# Time log: wave 1, circular impact and the passport

Real clock, Helsinki. Agent: Opus, worktree `vigorous-pare-5aac81`, base `4142a22`.

| When             | What                                                                                                                                                                                                                      |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-11-05 18:47 | `npm run setup`: node_modules copied, DB seeded, the hook step failed on a `.git/config` lock held by a parallel slot. `npx husky` + `git config --worktree core.hooksPath .husky/_` fixed it; hooks ran on every commit. |
| 18:50            | Read the brief, D15, `co2-factors.json` (no design life, no money factor), the bus, the practice repo's `impact` and `lifePeriods`.                                                                                       |
| 18:52            | Tests first: `co2.test.ts` (2/60, worn out, cap, card 10), then `co2.ts`. 16 tests. Commit.                                                                                                                               |
| 18:58            | `passport.test.ts` (whole months like the invoice schedule, open life, same-day order, ebike-008), then `passport.ts`. 16 tests. Commit.                                                                                  |
| 19:03            | `asset-events.ts`, `passport-handlers.ts`, `event-handlers.ts` (no registration module existed; created it), tests on `createTestDb()` with a contract fixture. 15 tests. Commit.                                         |
| 19:08            | Route row, route, page, impact strip, 44 message keys × 4, catalogue mount line, asset-card link. `npm run openapi`. Typecheck clean.                                                                                     |
| 19:10            | `next dev`: ebike-008 and ebike-009 in en/fi/sv/et at phone width; a temporary third life in dev.db showed the timeline (removed after). API 200 and 404 checked. Commit.                                                 |
| 19:15            | README section, D15 status, this log; `check:all`.                                                                                                                                                                        |

## Choices made here (not in the brief)

- **Design lives are constants in `co2.ts`** (e-bike 120, laptop 48, farm machine 144 months): the data pack has none. `co2Method(factors, designLives?)` takes them as an argument so tests can use 60.
- **Undated past lives count 24 months each** (`ASSUMED_PAST_LIFE_MONTHS`), marked estimated on the page. `passportFor` treats `previous_lives` as the lives before the log: if the catalogue slice later increments `previous_lives` on a return, the passport would count that life twice. Agree this with the contract/catalogue slice before wave 2.
- **An open life counts its months to the demo-clock day**, so the CO2 grows as the lease runs.
- **`co2SavedByLife` takes `monthsUsedBefore`**, needed for the cap; `co2SavedForAsset(method, { category, lives })` fills it in.
- **The read functions live in `asset-events.ts`** (`readPassport`, `readFleetImpact`); assets are read through `listAssets` (there is no `getAsset`).
- **Money saved is not shown**: the factors file has no money factor; the page says so.

## Left undone

- Nothing emits events yet, so the handlers run only in tests until the contract slice imports `src/server/event-handlers.ts`.
- `assessed`, `refurbished`, `repriced` have no writer yet (the second-life assessment slice will call `appendAssetEvent`).
- The e-bike's avoided car km factor is not used (the usage in the data pack is a lifetime total, not per life).

Closed by the wave 2 upkeep, 2026-11-05: the task is merged; signing (#16) and the exits (#20) emit the four events now, so the passport is written outside the tests too.
