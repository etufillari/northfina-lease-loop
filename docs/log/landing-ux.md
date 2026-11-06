# Time log: landing page feedback (How it works, the impact strip)

Real clock, Helsinki. Coding session: Opus, in the main checkout, branch `feat/landing-ux` cut from `main` at `a271bca`. From Panu's frontend feedback list, items 4, 8 and 9. The review fixes (PR #30) were applied by the team in a review worktree while Panu slept.

| When             | What                                                                                                                                                                                                                                                                                                   |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 2026-11-05 23:35 | "How it works" went dead after one click: the URL already ends in `#how-it-works`, so Next's router does nothing. `HashLink` scrolls the section into view itself; the header's `NavLinks` does too.                                                                                                   |
| 23:40            | The impact strip says what "fleet" meant (items leased again through Lease Loop) and drops its list of items. Checked live: three clicks in a row all land on the section; the new text renders.                                                                                                       |
| 23:45            | Feature pages (look, circular impact), this log. Commit `dd411f6`; PR #30 opened.                                                                                                                                                                                                                      |
| 2026-11-06 00:16 | Review of #30. `main` merged in (`41bc2dd`, no conflicts).                                                                                                                                                                                                                                             |
| 00:19–00:27      | Review fixes, one commit each: `sectionOnPage` pure with seven tests (`e4c4482`); the phone menu closes on the jump (`d2daef4`); `pushState`, so Back undoes it (`357b2c6`); focus on arrival from another page (`2383f7a`); README line 163 (`ea0c2aa`); look page. Checked live in the browser pane. |
| 00:30            | `npm run check:all` green: 103 test files, 1019 tests passed (9 todo), build compiled.                                                                                                                                                                                                                 |

## Blocked

Nothing.

## Left undone

- The landing page no longer lists each item's saving (smart problem 7 asks per item and for the whole fleet). Each saving is on its item's passport; whether to bring back a list is Johannes's call.
- `readFleetImpact` still returns the per-item list, now read only by its test.
- Smooth scrolling itself was not watched (the browser pane was hidden); the call and the instant path were checked.

Closed by the wave 3 upkeep, 2026-11-06 05:39: the task is merged (#30); the per-item saving stays on each passport, Johannes's call.
