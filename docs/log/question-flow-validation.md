# Time log: answers that cannot be true, the record check and the signatory

Real clock, Helsinki. Coding agent: Opus, in the main checkout, branch `fix/question-flow-validation` cut from `main` at `2a76c9e`.

| When             | What                                                                                                                                                                                                                                                                                                                                           |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-11-05 22:12 | Survey of the question flow for answers it takes that make no sense, with a throwaway probe test (deleted). Found: any real day is a birth date (2030 → "apply from 2048", 1800 → approved); a consumer on record answering "company" skips the age question and is approved; anyone can sign an `awaiting_signatory` case by typing any name. |
| 22:30            | Tests first: `answers.test.ts` (`birthDateRange`, `answerProblem`), `record-check.test.ts`, `signatory.test.ts`, `eligibility.test.ts` (D38), `applications.test.ts` (the three traps on a real DB). 14 failing as expected, on Node 22 (`.nvmrc`).                                                                                            |
| 22:33            | Domain: `answerProblem` and `birthDateRange` in `answers.ts` (D37, D39), `record-check.ts` (D38), `signatory.ts` (D39), the held reason in `eligibility.ts`. Server: `createApplication` and `decideApplication`, 403 `NOT_SIGNATORY`. 544 tests green.                                                                                        |
| 22:34            | Pages: the flow's specific error messages and the date picker's `min`/`max`; the decision page names the differing question and shows the sign form on the company's account only. Message keys in the four files.                                                                                                                             |
| 22:35            | Decisions D35 to D37, renumbered D37 to D39 at the merge of `main` (22:46), the feature page, this log.                                                                                                                                                                                                                                        |
| 22:41            | The survey's last hole, fixed on the same branch: `createApplication` answered for any `customerId` in the body, so Mikko could apply as Aino with her answers. Test first (failed), then `not_applicant` unless the actor is the customer, 403 `NOT_APPLICANT`; D40.                                                                          |
| 22:46            | Merged `main` (#19, #20, #21, #23): `main` had taken D35 and D36 (cancelled invoice, audit chain), so this branch's decisions are D37 to D40. Conflicts: the decisions table and an import in the apply page, which now reads today once from main's `Promise.all`.                                                                            |

## Left undone

- The signatory's identity is still only an e-mail typed on the company's account; a real check needs an e-mailed one-time link.
- The other findings of the survey (quantity by customer type, sanity of income, revenue and registry answers) were left out on purpose: the user chose the first three.

Closed by the wave 3 upkeep, 2026-11-06 05:39: the task is merged (#25); the e-mailed one-time link came with #49, the other survey findings became D48 to D59 (#51).
