# Time log: feat/signatories

- 23:16 start, fetch; no `test/question-flow-hardening` branch on origin yet. `npm run setup` 2 min 16 s.
- 23:23 schema: `CompanySignatory`, `SignatureRequest`, migration `20261105212314_signatories` (`prisma migrate dev` worked non-interactively). `valid_from` is nullable: null = the entry waits for its signing link (deviation from the brief, so a named stranger is never in force before the link is opened).
- 23:30 domain: `src/domain/signatories/mandates.ts` (half-open ranges: `valid_to` and `expires_on` are exclusive), record-check adds `q_email`, `q_monthly_income`, `q_can_sign`, `q_annual_revenue`; `signatory_is_applicant` also against the record e-mail; `whoDecides`.
- 23:45 server: `src/server/signatories.ts`, token path `decideByToken`, `onBehalfOf` for the admin (D47), seed.
- 23:55 routes, route table, openapi. 00:10 pages (sign, signatories list, decision-page demo outbox), question-flow error codes, keys in four languages.
- 00:15 merged origin/main (#26 hardening, #29, #30). Added the two new tables to `tests/helpers/reset-db.ts` (RESET_ORDER must name every model; deleting customers would otherwise hit the FK). Hardening session: please keep this.

- 02:40 (after a usage-limit pause) `test/question-flow-hardening` (PR #36) is stacked on the pre-squash #25 commits, so a plain merge conflicted on every #25 file: aborted, merged `origin/main` (a7c1617, Panu's decision page kept, outbox in place of the sign card), then applied only its own commits (`git diff 4d89a1a 16c2be8 | git apply -3`). Its `applicantEmail` and `q_can_sign` fixes replace mine; its tests now sign through the link, the admin needs `onBehalfOf`, the plausibility income cases use an agreeing record.
- 03:00 decisions renumbered to D46 (signatories) and D47 (admin on behalf), main's last being D42; D38 to D40 amended in place. Feature page `signatories.md`, `question-flow.md` updated, STATUS, features README and README Features lines.
- PR #36's `route.test.ts` and `applications.hardening.test.ts` cleared tables with `deleteMany` in their setup, which the meta rule refuses since #26: switched to `resetDb` + seed (hardening session: keep).
- Targeted tests only after each step (machine at 100 %); one `check:all` before the push.

## Left undone

- The decision page does not link to the signatory list page (reach it at `/<locale>/customers/<id>/signatories`).
- 03:40 merged main again (#33 term limits took D43, #48 My leases): mine are now D46 (signatories) and D47 (admin on behalf); the message files merged key by key.
- 04:00 merged main again (#36 squash-merged as 0e6312b): main's hardening log; my versions of the test files (they hold #36 plus the signing link). Main's property test missed `term_over_category_max` (#33 came first): added to its known refusals.
- 04:30 merged main again (#27 upkeep took D44 test isolation and D45 start date): mine are now D46 (signatories) and D47 (admin on behalf).

Closed by the wave 3 upkeep, 2026-11-06 05:39: the task is merged (#49); findings 1, 3 and 12 of `docs/reviews/wave-3.md` are its follow-ups.
