# Time log: wave 0 upkeep and review

Real clock, Helsinki. Coding agent: Opus, worktree `nostalgic-sutherland-1bb709`, from `main` at `4142a22`. Time limit 40 minutes.

| When  | What                                                                                                                                                                                                                                       |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 18:45 | `npm run setup` failed at the hooks step: `config.worktree` held the main checkout's absolute `.husky\_`. Fixed in the slot, later in the script.                                                                                          |
| 18:50 | Actor picker mounted in the header, restyled on the UI kit; checked on `next dev` at 375 px in all four languages (cookie set by the click, name shown selected).                                                                          |
| 19:00 | Review: check:all green (280 tests); drift and OpenAPI tests current; seed idempotent on a second `db:setup`; demo clock read once per request; rollback test sound; badge tones missing for three contract statuses (fixed, with a test). |
| 19:15 | Footer text, setup hook fix, `docs/reviews/wave-0.md`, kick-off log closed, D17 and D20 marked implemented.                                                                                                                                |

## Left undone

- The "Open" list in `docs/reviews/wave-0.md`, handed to the slices' next owners.
- The first `preview_start` with `-p 3107` collided with a port another slot held; launch configs for slots should leave the port to the pane (no `-p`).

Closed by the wave 2 upkeep, 2026-11-05: the task is merged; its open list was handed on in `docs/reviews/wave-0.md`.
