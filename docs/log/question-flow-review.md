# Time log: review of PR #31 and its findings (why we ask, the decision page)

Real clock, Helsinki. Coding session: Opus, in its own worktree, first on `review-31` (PR #31 merged with `main` for the review), then on `fix/question-flow-review` cut from `main` at `3718825`. Follows up Panu's PR #31 (`c577168`), which was merged while the review ran.

| When             | What                                                                                                                                                                                                                                                  |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-11-05 23:50 | Review of #31: merged `origin/main` into `feat/application-ux` locally. One conflict, the decision page imports (`LinkButton` from the PR, `loadQuestions` from #25); kept both, dropped `Badge`.                                                     |
| 23:55            | `npm run setup`, `npm run db:setup`, then `check:all` on the merged tree: format, lint, types, file size, no-AI and 1012 tests green; the build step's end was not captured.                                                                          |
| 2026-11-06 00:10 | Dev server: cards 5, 6 and 7 through the API, decision pages in en and fi. Each shows its outcome, its reasons from the message files (Mikko: "You can apply from 10 March 2027"), one h1 and both closing links; #25's sign form and notices render. |
| 00:15            | #31 turned out merged by Panu with the same import resolution, so the review findings go on a new branch from `main`.                                                                                                                                 |
| 00:17            | `1571006`: the why-we-ask note spans the column on a phone (`w-full sm:w-fit`).                                                                                                                                                                       |
| 00:20            | `772c816`: `decision.catalogue` in all four message files instead of reusing `home.cta.catalogue`.                                                                                                                                                    |
| 00:21            | `83174d0`: the decision outcome is an `h2`; `role="status"` dropped.                                                                                                                                                                                  |
| 00:23            | `e0bb925`: the feature page's UI notes move under "The rule" as "On the page".                                                                                                                                                                        |
| 00:25            | Targeted tests (`src/server/applications.test.ts`, `src/domain/question-flow`, `src/i18n`): 126 green. This log, `check:all`, push, PR.                                                                                                               |

## Blocked

Nothing. The machine was saturated, so only targeted tests ran between commits and `check:all` ran once before the push.

## Left undone

- Finding 4: an approved application has no "Sign the contract" button (signing is only `POST /api/contracts`); it gets its own PR.
- From `sm` up the why-we-ask note still widens a little when opened.
- Not checked in a browser after the `h2` change: keyboard and focus on the note, dark mode, sv and et pages.

Closed by the wave 3 upkeep, 2026-11-06 05:39: the task is merged (#37); the Sign button came with #47.
