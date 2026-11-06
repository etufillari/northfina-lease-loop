# Wave 1 hardening: the scenario harness and the README "Status" table

Agent: Claude Opus 5.5 (AGENTS.md rule 9, D18). Slot: worktree `relaxed-shaw-f712d4`, branch `test/wave1-hardening`. Base: `origin/main` at `d6bd4f5` plus `origin/feat/pricing` and `origin/feat/invoices`. Time limit 90 min; started 20:13, stopped at 20:42 (Thursday 5 Nov 2026, Helsinki time).

## Steps (real clock)

| Time  | Step                                                                                                                                                                                                                                                                                                                                                                                 |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 20:13 | Branch renamed to `test/wave1-hardening`; fetched `main`, `feat/pricing`, `feat/invoices`.                                                                                                                                                                                                                                                                                           |
| 20:14 | Merged `feat/pricing` (clean), then `feat/invoices`: conflicts in `routes.ts` (both import blocks: kept the invoices' wider one, both sets of rows), the four message files (both key sets, valid JSON), `docs/decisions.md` (both sides set the Status column of D1–D8: kept whichever was not `proposed`, one row each), `docs/openapi.json` (regenerated with `npm run openapi`). |
| 20:16 | `npm run setup`, `npm run db:setup`, `npm run check:all`: green, 555 tests, build OK.                                                                                                                                                                                                                                                                                                |
| 20:19 | Merge committed (`395b0c7`). Read the domain modules and the five feature pages.                                                                                                                                                                                                                                                                                                     |
| 20:26 | `fixtures.ts` + `fixtures.test.ts`, cards 1–4: every pinned number passed on the first run.                                                                                                                                                                                                                                                                                          |
| 20:27 | Cards 5–10. One miss, mine: I had guessed card 5's 12-month gross by hand as 20 003; the code says 19 875 (net 289 000 × 0.054799 = 15 836.9 → 15 837, VAT 4 038.4 → 4 038). The code was right; the pin was fixed.                                                                                                                                                                  |
| 20:31 | `traps.test.ts`, `customers.test.ts` (the 30 decisions printed, the affordability and PEP ones checked by hand, then pinned).                                                                                                                                                                                                                                                        |
| 20:33 | `quote-schedule.property.test.ts`: found the down payment VAT gap (below), first as an `it.fails`.                                                                                                                                                                                                                                                                                   |
| 20:34 | Feature pages against the tests: pinned the four derived numbers no test had literally (543 126, 10 269 / 6 631, 369 520). Added one "Tests that pin the numbers" line to `circular-impact.md`, `question-flow.md`, `pricing.md`, `invoicing.md`.                                                                                                                                    |
| 20:37 | README "Status": the ten-card table, the traps, the smart problems.                                                                                                                                                                                                                                                                                                                  |
| 20:38 | `origin/main` now has #12 (`83ca83a`) and #11 (`fa8f11f`). Merged it; 16 add/add conflicts because the #11 squash carries later pricing commits than the branch tip I merged at 20:14. Took `main`'s side for every file I do not own (`git checkout origin/main -- <conflicted>`), then checked that `git diff origin/main` lists only my files.                                    |
| 20:40 | The pricing slice had already fixed my finding (`4ec3b2e`, VAT on the down payment and the buyout in the totals). Re-pinned card 1's total if bought (558 005) and turned the `it.fails` into a passing regression test; re-added my lines on the pricing and invoicing pages, which `main`'s side replaced.                                                                         |
| 20:41 | `npm run check:all` on the merged branch: green, 65 files, 669 tests passed, 11 todo, 98.5 % lines, build OK.                                                                                                                                                                                                                                                                        |
| 20:42 | Re-checked `origin/main`, pushed, opened the PR.                                                                                                                                                                                                                                                                                                                                     |

## Commits

`395b0c7` merge of the two branches · `0050268` fixtures · `2fa0206` cards 1–4 · `e11466f` cards 5–10 · `3add13f` customers **and the traps** (the traps commit's header was 101 characters, commitlint refused it, and the staged file went into the next commit) · `d105742` quote/schedule property · `320f39d` derived numbers · `79df241` feature-page lines · `4b8ea0a` Status · `9a1110a` merge of `origin/main` · `92d94ea` re-pins on main · `d052b29` Status update · this log.

## Hand checks of the pinned numbers

All against `data/` and D1 (half up, once, integer cents):

- Card 1: 389 000 × 27 584 / 10⁶ = 10 730.18 → 10 730; VAT 10 730 × 25.5 % = 2 736.15 → 2 736; at 26 %, 2 789.8 → 2 790, gross 13 520; buyout 15 % = 58 350. The start is the quote day, so invoice 3 (5 Jan 2027) is the first at 26 %: total 2 × 13 466 + 34 × 13 520 = 486 612.
- Card 2: 349 000 × 0.027584 = 9 626.8 → 9 627; 321 100 × 0.027584 = 8 857.2 → 8 857.
- Card 3: 189 900 × 0.036637 = 6 957.4 → 6 957; 6 957 × 25.5 % = 1 774.0 → 8 731; × 26 % = 1 808.8 → 8 766.
- Card 4: 119 900 × 0.028625 = 3 432.1 → 3 432.
- Card 6: 2 196 000 × 0.026864 = 58 993.3 → 58 993; 549 000 × 0.027584 = 15 143.6 → 15 144.
- Card 7: 12 500 000 × 21 763 = 272 037 500 000 millionths, exactly half → 272 038; 8 % buyout 1 000 000.
- Card 8: 29 × 10 730 = 311 170; the D14 balance 330 675 is the invoicing slice's figure, unchanged.

## Findings for the upkeep review

1. **Fixed on `main` before this PR:** the quote's totals added the down payment and the buyout net while invoice 0 charges VAT on the down payment (card 7: 510 000 short). My first `it.fails` for it was itself wrong: it compared totals across the 1 Jan 2027 rate change, so it would have failed after the fix too. The final test compares only the down payment line, and the property compares totals only where one VAT rate covers the term.
2. `docs/features/invoicing.md` names its section "Tests that pin it", not the template's "Tests that pin the numbers" (`docs/features/README.md`).
3. Traps the pack hides only on price list v1: `laptop-002` / `laptop-003` both cost 184 000 on v2 (both band A), and `ebike-010` is 30 300 on v2, inside band A. A judge running these on 6 Nov or later will not see the trap. Worth a line on the pricing page and in the demo steps.
4. `answers.ts` still has its own `grossFromNetCents` ("a local copy until the pricing slice's VAT helper lands"), and `src/server/applications.ts` uses it. It agrees with `splitVat` on every case the harness runs; the upkeep can swap it now that pricing has landed.
5. The reserved `ebike-009` is refused only in `src/server/quotes.ts` (it reads the status from the database). The domain has no availability check, so the harness can only point at `quotes.test.ts`.
6. The waiting list has no sign-up date: the `wait-06` / `wait-14` twins differ only in list order and in their `who` text. The wave 3 matcher has to treat list order as sign-up order (or the team adds a decision).

## What blocked me

Nothing for long: one bash heredoc that would not parse (written with the editor instead), and one probe command that waited on stdin (stopped after 2 min).

## Left undone

- Cards 8, 9, 10: 11 `it.todo`s with the pinned number in the name (the early-exit price and market value 311 200; the refurbishment plan 35 000 + 4 500 + 12 000 and the `wait-02` / `wait-13` match; the passport page). They belong to waves 2 and 3.
- The matcher's tie-break for both twin pairs (2 todos in `traps.test.ts`).
- The demo page's one button per card (kickoff brief section 8) is not part of this slot.

Closed by the wave 2 upkeep, 2026-11-05: the task is merged; the card 8 todos are the wave 2 hardening's, cards 9 and 10 wave 3's.
