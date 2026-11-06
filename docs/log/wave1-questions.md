# Time log: wave 1, the question flow and the application

Real clock, Helsinki. Coordinator: Fable; coding agent: Opus. Slot `relaxed-shaw-f712d4`, branch `claude/relaxed-shaw-f712d4`, base `main` at `4142a22`.

| When             | What                                                                                                                                                                                                                                                               |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 2026-11-05 18:47 | Base commit checked; `npm run setup` (failed at the hooks step: the worktree's `core.hooksPath` pointed at the main checkout; fixed with `git config --worktree core.hooksPath .husky/_`, as the wave 0 notes say). Read the rules, the data, the brief.           |
| 18:52            | Engine tests first (cards 1, 6, 7 and the can-sign pruning card), then `engine.ts`; 22 green. Commit `83da964`.                                                                                                                                                    |
| 19:00            | Eligibility, Y-tunnus and answer mapping with tests (card 5 with the 24/36/48-month rents, card 6, card 7, the broken business id, every persona). The first commit was blocked by lint (a literal no-break space in a regex); fixed. Commit `97e26f7`.            |
| 19:05            | `src/server/applications.ts` and its tests on `createTestDb()` with quote rows inserted by the test; answer validation by type. Commit `5920901` (it also took the route-table rows and `docs/openapi.json`, which were staged at the time).                       |
| 19:10            | The three routes. Commit `e2aabeb`.                                                                                                                                                                                                                                |
| 19:16            | The apply page, the client flow, the decision page and form, 89 message keys in four languages. Commit `5221258`.                                                                                                                                                  |
| 19:20            | Tried on `next dev` with four quote rows inserted by an uncommitted tsx script: card 7 (prefill, PEP changed to no prunes the details with a notice, manual review, admin approves), card 5 in Finnish ("Voit hakea 10. maaliskuuta 2027 alkaen"). Server stopped. |
| 19:30            | README "Application", this log; `npm run check:all` green (format, lint, typecheck, size, no-AI, tests with coverage, build). PR opened.                                                                                                                           |

## Decisions taken inside the slice

- `customer_type` in `ask_when` reads the applicant's `q_customer_type` answer once given, so changing it re-targets and prunes the flow; before that, the context's type.
- A PEP known from the customer record is a PEP even below 10 000 EUR, where the bank does not ask (never auto-approved).
- Affordability is checked only when the bank asked for income (consumers from 200 000 financed); the comparison is exact in integers (rent × 100 ≤ income × 30).
- A failed rule always rejects, and every failure is listed; PEP comes before the signatory; a PEP case that also needs a signatory goes to `awaiting_signatory` once the admin approves.
- A wrong Y-tunnus check digit is a valid answer and a rejection reason, not a form error, so card "broken id" reaches its decision.

## Left undone (for the upkeep agent)

- **`getQuote` swap**: `flowSetupFor` in `src/server/applications.ts` reads the quote with `db.quote.findUnique`; replace it with the pricing slice's `getQuote` when it lands. The asset category is read through `listAssets` (there is no `getAsset` yet).
- **VAT helper**: `grossFromNetCents` in `src/domain/question-flow/answers.ts` is a local half-up copy; swap for pricing's helper if it differs.
- **Quote-page link**: the pricing page needs an "Apply" link to `/[locale]/apply/[quoteId]`; the demo page's cards 5, 6, 7 can link there too.
- The decision page's PEP sentence still says "we will be in touch" after an admin approved; a separate "approved after review" line would read better.
- The signatory sign-off trusts the name typed in (no login, D17); the actor is audited.

Closed by the wave 2 upkeep, 2026-11-05: the task is merged; the price page links to the apply page, and the apply page says an expired quote up front (wave 2 upkeep).
