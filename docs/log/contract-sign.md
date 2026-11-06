# Time log: the Sign button (issue 39)

Real clock, Helsinki. Coding agent: Opus, in the main checkout, branch `feat/contract-sign` cut from `main` at `3718825`.

| When             | What                                                                                                                                                                                                                                                                         |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-11-06 02:00 | Start. `POST /api/contracts` signs and is tested; no page calls it, so cards 1, 3, 4 and 8 cannot be reached in the app.                                                                                                                                                     |
| 02:05            | Owner's read `contractIdOfApplication` in `src/server/contracts.ts` with its test; `signRefusalText` in `src/components/sign-refusal.ts` with its test (every refusal code in all four languages).                                                                           |
| 02:10            | `SignContractForm` (start day, Sign, then the contract page) and the Sign card on the approved application page: the form for the applicant or admin, a link once signed, a notice for anyone else. Ten `contract.sign.*` keys in `en`, `fi`, `sv`, `et`.                    |
| 02:15            | Typecheck, lint and the affected tests green on Node 22 (the shell's Node 24 cannot load `better-sqlite3`).                                                                                                                                                                  |
| 02:20            | Live check on a copy of `dev.db` (port 3123): Aino quotes `ebike-003`, applies, sees the form (start 5 Nov 2026 to 3 Feb 2027), signs, the page then links to the contract (200); Mikko sees the notice and the route refuses him; a start on 1 Jun 2027 is `start_too_far`. |
| 02:25            | `contracts.md`, `STATUS.md`, the README; `check:all` green on Node 22: 104 files, 1 038 tests, 96.7 % lines, the build. Not committed: waiting for the go-ahead.                                                                                                             |

## Left undone

- The click in a real browser (the form's `fetch` and `router.push`) was not driven; the live check posted the same body with curl and read the rendered pages.
- Who signs after the named signatory approves an `awaiting_signatory` case stays open (`contracts.md`); the form follows today's rule: the applicant customer or admin.
- Card 8 still needs seven paid rents set up by hand: no Pay button yet (issue 34, the demo buttons).

Closed by the wave 3 upkeep, 2026-11-06 05:39: the task is merged (#47); who signs after the named signatory approves is the signing link of #49.
