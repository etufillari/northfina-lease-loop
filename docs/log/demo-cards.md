# Time log: `feat/demo-cards` (wave 3, issues #34 and #35)

Base `main` at `a8a71cf`, worktree slot `vigorous-pare-5aac81`, time limit 120 minutes. Real clock, Helsinki time, 2026-11-06.

| Time  | Step                                                                                                                                                                                                  |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 03:54 | Base checked (`a8a71cf`), branch renamed to `feat/demo-cards`, `npm run setup` (34 s, migrations and seed included).                                                                                  |
| 03:56 | Read the scenario tests and `tests/helpers/journey.ts`, the demo page and clock, the route table, the services' read functions, issues #34 and #35.                                                   |
| 03:58 | `6cedc80` the schemas and the route row (contract first).                                                                                                                                             |
| 03:59 | `00c2c6f` `demoClockCookieHeader`, the clock route uses it: the cookie name and attributes in one place.                                                                                              |
| 04:00 | `556e9c1` the card table and `runDemoCard`, 15 tests on a test database, green on the first run (all ten cards in one database too).                                                                  |
| 04:03 | `c142a43` the route and its test (the test database needed the pack seeded); OpenAPI regenerated.                                                                                                     |
| 04:08 | `919907e` the page: `card-list.tsx`, `card-run-form.tsx`, `card-steps.ts` and its test, 27 keys × 4 languages, `demo.cards.soon` removed.                                                             |
| 04:09 | `221f2dd` the audit log link in the teal strip for everyone (#35), `docs/features/look.md` updated.                                                                                                   |
| 04:10 | Live check on the dev server at 375 px: cards 8, 2, 9, 10 run, card 1 after 8 refused and linked, no sideways scroll, the landing opens as Aino.                                                      |
| 04:12 | D70 to D72, `docs/features/demo-cards.md`, the README "Features" link, this log.                                                                                                                      |
| 04:20 | `check:all` failed on a test file's types (untyped coded lines), fixed in `test(demo)`; green on the second run (1413 tests, build). PR #52 opened.                                                   |
| 04:30 | Opus review of #52 (and #53, forwarded to its session).                                                                                                                                               |
| 04:48 | Review fixes: a stopped run is signed, the earlier-run match compares the whole deal, card 8 previews again, reasons and refused steps in the app's own sentences, a clock route test, D70 rewritten. |

## What blocked it

Nothing. Python is not installed in this shell, so the file edits went through Node one-liners and the editor.

## What it left undone

- Cards 9 and 10 stop at the asset and passport pages: the assessment is `feat/second-life`, not on `main`. `afterReturn(db, card)` in `src/server/demo-cards.ts` is where it plugs in (feature page, open questions).
- The contract page scrolls sideways at 375 px (848 px wide, the invoice table); not this slice's page, a follow-up for its owner.
- The README "15-minute tour" is the organiser's list of files; no line added there. The README "Status" table and `docs/features/STATUS.md` are the hardening agent's and the coordinator's.
- The landing pages have no anchors to the exit block or the invoice table (other slices' components).

Closed by the wave 3 upkeep, 2026-11-06 05:39: the task is merged (#52); cards 9 and 10 still stop at the returned asset (finding 2 of `docs/reviews/wave-3.md`, the wave 3 hardening), and the contract page's 375 px overflow is its owner's.
