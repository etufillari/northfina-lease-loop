# Time log: cleanup (review-and-upkeep)

Branch `chore/cleanup`, 2026-11-06, from `origin/main` at `b11c060` (#78; the list was reviewed on `e76ab58`). The list Johannes approved from a read-only review, nothing wider. Not touched: the second-life page, `src/server/second-life.ts` and `docs/features/second-life.md` (another agent's).

| Time  | Step                                                                                                                                                                                                           |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 12:07 | Branch, `npm run setup`                                                                                                                                                                                        |
| 12:08 | Grep for every item: `mayReadApplication`, `exitRefusalSchema` and the seven exported types are used nowhere, not even in their own files, so all are deleted, not just un-exported                            |
| 12:09 | Three `refactor` commits; the question-flow page loses the function and its resolved open question                                                                                                             |
| 12:10 | `docs/submission.md`: D1 to D84 (D84 merged in #78 after the review), the mentor questions answered, review finding 1 ticked (#61), `authorization.md` and `user-portal.md` in the Docs list                   |
| 12:11 | `docs/mentor-questions.md`: D83 replaces D79 in section 2; section 3's "What the code does" now gives D83's numbers, the D79 paragraph marked as the earlier answer                                            |
| 12:12 | `circular-impact.md` summary: €332.80 (6 Nov) and €314.80 (5 Nov) for card 10's life 2, as in its worked example                                                                                               |
| 12:12 | `STATUS.md`: wave 2 upkeep #27, signatories #49, wave 3 hardening #57 and fleet quantity #66 done; submission in progress; a section for #69, #70/#75, #73, #74, #76, #77, #78                                 |
| 12:13 | README: "Mentor questions (all answered)", card 10's money saved in the Status row, the D80 estimate note moved out of the middle of the smart-problem list; team-notes renamed the same way                   |
| 12:14 | Relative-link check over README.md and docs/\*\*/\*.md: 86 files, 0 broken                                                                                                                                     |
| 12:15 | `npm run check:all`: format, lint, typecheck, file size and no-AI green; 4 server tests timed out at 5 s under the machine's load (card-10, demo-cards, relisted-exit, an EBUSY on a temp db); alone they pass |
| 12:17 | `test:coverage` and `build` again: 151 files, 1 768 tests green, build compiled                                                                                                                                |
| 12:20 | Pushed, PR opened                                                                                                                                                                                              |

Left undone (outside the list): `docs/demo.md` still says "Once the wave 3 hardening PR (#57) is merged" before the card 9 and 10 note; #57 is merged.
