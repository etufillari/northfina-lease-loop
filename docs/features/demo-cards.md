# Demo cards: one button per scenario card

## What it does

The demo page (`/[locale]/demo`) has a Run button for each of the ten scenario cards of `CHALLENGE.md` section 4: it runs the card through the same services the routes call, each step on the card's own day and as the card's customer, then sets the demo clock and the actor and links the page where the judges compare the numbers. The page is also the one entry point to the demo tools (issue #35): the clock, the cards, and the audit log with its chain badge and the `npm run demo:tamper` note; the audit log link in the teal strip is now there for everyone.

## The rule

A card is **data**, its inputs only, in one table (`CARD_INPUTS` in `src/server/demo-cards.ts`, checked by `demoCardSchema`): the customer, the item (one, D8), the term, the down payment, the quote day, the signing day, the rents to pay, the exit mode and the reported condition, and the day the judges look (`clock`). The outputs are whatever `createQuote`, `createApplication`, `signContract`, `payInvoice` and `previewExit` return; the runner never knows a card's numbers (AGENTS.md rule 7). Every write goes through those services, so through `withAudit`, and the audit log shows the run.

| Card               | Run                                     | Inputs                                           | Clock      | Actor   | Lands on                                                                        |
| ------------------ | --------------------------------------- | ------------------------------------------------ | ---------- | ------- | ------------------------------------------------------------------------------- |
| 1 Happy path       | quote → apply → sign                    | Aino, `ebike-003`, 36 months, 0 down, 5 Nov 2026 | 2026-11-05 | Aino    | the contract: 13 466, 13 466, 13 520                                            |
| 2 Price lock       | quote and apply 5 Nov, sign 6 Nov (D72) | Aino, `laptop-004`, 36 months                    | 2026-11-06 | Aino    | the contract: 9 627 kept, list 2 would be 8 857                                 |
| 3 Tax is not price | sign on 15 Sep 2026                     | Aino, `ebike-001`, 24 months                     | 2027-01-01 | Aino    | the contract's invoices: December 8 731, January 8 766                          |
| 4 Calendar traps   | sign on 31 Jan 2026                     | Aino, `laptop-001`, 36 months                    | 2026-02-01 | Aino    | the contract: due 28 Feb 2026, 29 Feb 2028, ends 30 Jan 2029                    |
| 5 Too young        | quote → apply                           | Mikko, `laptop-008`, 36 months                   | 2026-11-05 | Mikko   | the application: rejected, `too_young`                                          |
| 6 Who can sign?    | quote → apply                           | Norvi, 1 × `ebike-004`, 36 months                | 2026-11-05 | Norvi   | the application: 15 144 a month, awaiting the signatory, with what happens next |
| 7 Big ticket       | quote → apply                           | Haapala, `farm-002`, 48 months, 20 000 € down    | 2026-11-05 | Haapala | the application: 272 038 a month, manual review (`pep`)                         |
| 8 Early exit       | card 1, 7 rents paid, the exit preview  | card 1 + buy, "good", 1 800 km                   | 2027-06-05 | Aino    | the contract and its exit block: buy 330 675, return 75 945                     |
| 9 Second life      | `afterReturn`: `assessAsset`            | `ebike-007` (fair, 18 400 km as the pack has it) | 2026-11-06 | admin   | the second-life page: fair for `wait-02`, 115 976, 6 497                        |
| 10 Third life      | assess → quote → apply → sign           | `ebike-008`; Olavi, 24 months, 6 Nov 2026        | 2026-11-06 | admin   | the passport: 32 601 at 1 194 a month, three lives, 58 kg                       |

Worked example, card 8 on a fresh database: the run answers six steps, `quote_created { monthlyNetCents: 10730, priceListVersion: 1 }`, `application_decided { decision: approved }`, `application_reason { reason: all_checks_passed }`, `contract_signed`, `rents_paid { count: 7, grossCents: 94532 }` (2 × 13 466 + 5 × 13 520) and `exit_previewed { monthsPaid: 7, buyTotalCents: 330675, returnTotalCents: 75945 }`, sets the clock to 5 June 2027 and the actor to Aino, and lands on `/contracts/<id>`. Clicked after card 1, it reuses card 1's contract (`contract_reused`). Clicked again, it pays nothing and only shows the preview again; once the contract has ended it is refused (D70).

Steps and refusals are codes with params; a decision reason is one `application_reason` step with the reason's own params, written with `decision.reason.<code>`, and a refused step is written with the slice's own refusal sentence; the page writes them from `demo.step.<code>` and `demo.run.<code>` in the visitor's language, with `…Cents` as euros and days as dates (`src/app/[locale]/demo/card-steps.ts`).

**The jump buttons.** "Demo clock", "Demo cards" and "Audit log" at the top of the demo page are `HashLink`s: they scroll to their section on every click, also when the URL already ends in that section's hash (a plain link did nothing the second time).

## Decisions

- **D70** a second click is refused with `card_already_run` and links the earlier records; a run stopped before signing is picked up and signed; card 8 builds on card 1 and only previews again.
- **D71** the run sets the demo clock to the card's look day and the actor to the card's customer, on a run and on a refusal.
- **D72** card 2 signs on the second day and lands on the contract.
- Uses D17 (the actor cookie), D44 (tests own their `beforeEach`), and the demo clock of `docs/features/catalogue.md`.

## Pure functions

None: this slice has no domain logic (it only drives the services). The server functions:

- `runDemoCard(db, cardId) → { ok: true, run: { cardId, today, actor, steps: [{ code, params, href? }], landing } } | { ok: false, reason: card_already_run | card_step_refused, today, actor, landing | null }`.
- `afterReturn(db, card, steps) → { alreadyRun }`: cards 9 and 10. Assesses the returned item with `assessAsset` as the card's actor on its clock day (steps `asset_assessed` and `relisted_for_winner` or `relisted_without_match`), then, for a card with a `lease`, quotes, applies and signs it as that customer. An item no longer `returned` with an assessment counts as run: a lease picks up where it stopped, otherwise `card_already_run` (D70).
- `demoClockCookieHeader(asOf | null) → string`: the one writer of the demo clock cookie, used by `POST /api/demo/clock` and the card route.
- Page helpers: `codedMessage(prefix, { code, params }, t, locale)` and `cardInputs(card, names, t, locale)`.

## Files

- `src/server/demo-cards-schemas.ts`: the card id, the card table's schema, the step and the run (Zod).
- `src/server/demo-cards.ts`: the card table and the runner.
- `src/app/api/demo/cards/[id]/run/route.ts`: `POST /api/demo/cards/{id}/run`; its row is in `src/server/routes.ts` and `docs/openapi.json`.
- `src/server/demo-clock.ts`: `demoClockCookieHeader`; `src/app/api/demo/clock/route.ts` uses it.
- `src/app/[locale]/demo/page.tsx`, `card-list.tsx`, `card-run-form.tsx` (client), `card-steps.ts`.
- `src/components/site-header.tsx`: the audit log link for everyone.
- `src/i18n/messages/{en,fi,sv,et}.json`: `demo.tools.*`, `demo.run.*`, `demo.step.*`, `demo.input.*`, `demo.audit.*`.

## Tests that pin the numbers

- `src/server/demo-cards.test.ts`: one test per card on a test database (the records match the numbers `src/server/scenarios/` pins, and the landing page), card 8 after card 1, the repeat-run refusal writing nothing, card 8 again only previewing, a stopped run signed, another deal on the same item not mistaken for the card, card 8 refused after its contract ended, all ten cards in one database with the audit chain intact, and a refused step.
- `src/app/api/demo/cards/[id]/run/route.test.ts`: the route sets both cookies, answers 409 `CARD_ALREADY_RUN` with the earlier page, and 400 for a card that does not exist.
- `src/app/[locale]/demo/card-steps.test.ts`: every step and refusal and every card's inputs line written (decision reasons and refused steps with the app's own sentences, never the code) in all four languages with no placeholder left.
- `src/server/demo-clock.test.ts` and `src/app/api/demo/clock/route.test.ts`: the cookie header, and the clock route setting, clearing and refusing.

## Open questions

- **Cards 9 and 10 run from the demo page** (wave 3 hardening): `afterReturn` calls `assessAsset`. The match's winner is a waiting-list entry (`wait-05` for card 10), not a customer record that can sign; card 10 says so in a `leased_from_catalogue` step, and Olavi leases the item from the catalogue at the same second-life price. Card 8's inputs line says to run card 1 first, since it builds on card 1's contract. Card 10's customer is `cust-olavi`, as in `src/server/scenarios/card-10.test.ts`; the card names none. The assessment takes the condition and usage the pack records for the item, so the card table carries no assessment inputs.
- The landing pages have no anchors (the exit block, the invoice table), since those components belong to other slices; the judge scrolls.
- A run of card 3 or 4 dated before card 1 (Sep 2026, Jan 2026) writes audit rows whose `created_at` is the real time; the audit log orders by row, not by the card's day.
