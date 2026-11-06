# Submission draft: the PR to the organiser

The text of the pull request from `ThomasParratt/northfina-lease-loop` `main` to `etufillari/northfina-lease-loop` `main`, in the order of the organiser's template (`.github/pull_request_template.md`). Every link is absolute, so it resolves in a PR body on the organiser's repo.

Title: `Team LeaseMasters: Lease Loop`

---

## Team

| Name     | GitHub          | Main focus                                                                                                                                                                                                    |
| -------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Johannes | `Tonttu84`      | coordination and decisions; pricing, invoicing, contracts, exits, second life, signatories, the demo cards                                                                                                    |
| Thomas   | `ThomasParratt` | the asset statuses, the row schemas, the decision race, the question-flow validation, the Sign button, the signed and anchored audit chain (D81), reviewing the pull requests                                 |
| Panu     | `panu-kangas`   | the look, the landing and catalogue pages, the price page, the passport card and popup, My leases and its review, the catalogue sort (D84), stepping back from an application and who signs a lease (D87–D89) |

## What we built

Lease Loop takes one e-bike, laptop or farm machine through three lives: a live price from the list of the day, a question flow that asks only what the amount needs, a contract that locks the price but not the tax, monthly invoices with the VAT of their own date, a fair early exit line by line, and a second life priced by the residual curve and offered to the waiting list by rules. Every item has a passport with its lives and the CO₂ they saved, and every change is a row in a tamper-evident audit chain. It is for Northfina's customers and staff; there is no AI, ML or LLM anywhere in the product.

## The Spine

- [x] Catalogue with today's price
- [x] Price with sliders (term, down payment)
- [x] Application with the question flow
- [x] Contract that locks the price
- [x] Monthly invoices from the contract
- [x] End of term: buy, return or pass on
- [x] Second life: re-price and re-lease

## Smart Problems we picked (at least 2)

- [x] 1. Lock the price, not the tax: done; the quote freezes the list version and the net rent, and each invoice takes the VAT of its own date ([docs/features/pricing.md](https://github.com/ThomasParratt/northfina-lease-loop/blob/main/docs/features/pricing.md), [docs/features/invoicing.md](https://github.com/ThomasParratt/northfina-lease-loop/blob/main/docs/features/invoicing.md)).
- [x] 2. Fair early exit: done, on the D31 assumption ([README "Status"](https://github.com/ThomasParratt/northfina-lease-loop#status)); buy, return and pass on line by line, the unpaid rents cancelled, one final invoice with the VAT of its day ([docs/features/exits.md](https://github.com/ThomasParratt/northfina-lease-loop/blob/main/docs/features/exits.md)).
- [x] 3. Second-life matchmaking: done, with its bonus, the passport (every item's lives, contracts, assessments and refurbishments, and the CO₂ and money each later life saved, on `/[locale]/assets/[id]/passport`); the assessment re-prices the returned item at its market value after the plan (a new battery resets the usage in the value, never the total, D83), the refurbishment being our cost and shown as value gain against extra cost, "worth it" or not (D86), every waiting-list entry gets a verdict naming its first failing step, the candidates are ranked by D13 with the step that decided each place, and the item is refurbished beyond the mandatory steps when the winner needs it (D61) or, with nobody waiting, when the work pays for itself (D86); the assessment page is back office, for the admin only (D85) ([docs/features/second-life.md](https://github.com/ThomasParratt/northfina-lease-loop/blob/main/docs/features/second-life.md), the passport in [docs/features/circular-impact.md](https://github.com/ThomasParratt/northfina-lease-loop/blob/main/docs/features/circular-impact.md)).
- [x] 4. The smart question flow: done; only the questions the amount needs are asked, and only what the customer answered decides: a hidden question's rule does not run (D82) ([docs/features/question-flow.md](https://github.com/ThomasParratt/northfina-lease-loop/blob/main/docs/features/question-flow.md)).
- [x] 5. Money that adds up: done for the schedule and the balance (property tests in `src/domain/invoicing/schedule.property.test.ts` and `src/domain/scenarios/quote-schedule.property.test.ts`) ([docs/features/invoicing.md](https://github.com/ThomasParratt/northfina-lease-loop/blob/main/docs/features/invoicing.md)).
- [x] 6. Explain my price: done; the breakdown line by line and the term comparison ([docs/features/pricing.md](https://github.com/ThomasParratt/northfina-lease-loop/blob/main/docs/features/pricing.md)).
- [x] 7. Circular impact: done; CO₂ (D15) and money saved in euros (D80: a new item's list price for the months used, minus the real refurbishment cost), per item on the passport and for the fleet on the landing page, card 10's third life from the demo page (58 kg and 665,60 € after it) ([docs/features/circular-impact.md](https://github.com/ThomasParratt/northfina-lease-loop/blob/main/docs/features/circular-impact.md)).

- [x] Wildcard: three things beyond the brief. (The asset passport is not one of them: it is the bonus of smart problem 3, listed there.)
  - **The time-travel clock.** One demo clock on the demo page; every date the product uses is read from it once per request, so the judges can stand on 6 November for the price lock, 1 January 2027 for the VAT change and 5 June 2027 for the early exit ([demo-cards.md](https://github.com/ThomasParratt/northfina-lease-loop/blob/main/docs/features/demo-cards.md), [catalogue.md](https://github.com/ThomasParratt/northfina-lease-loop/blob/main/docs/features/catalogue.md)).
  - **The tamper-evident, sealed audit chain.** Each audit row carries the hash of the one before and an Ed25519 signature made with a key outside the database, and every new head is copied to an anchor file outside it; the audit page shows the head hash and the public key and names the first broken row. `npm run demo:tamper -- --rewrite` recomputes every hash and is still caught, and `npm run audit:anchor` has a public RFC 3161 timestamp authority sign the head (D81, [audit-chain.md](https://github.com/ThomasParratt/northfina-lease-loop/blob/main/docs/features/audit-chain.md)).
  - **The signatory link.** A company's signatory list and a one-time signing link for the named person: only the holder of the link signs card 6, and the demo outbox stands in for the e-mail ([signatories.md](https://github.com/ThomasParratt/northfina-lease-loop/blob/main/docs/features/signatories.md)).

**What's smart about our solution?** One rounding rule, half up, in one function on integer cents and a factor in millionths; the quote freezes the list version and the net rent while each invoice takes the VAT of its own day; the early exit is the outstanding balance by amortisation, shown line by line; the second-life price is the market value after the refurbishment (the work is our cost, weighed as value gain against extra cost, D86) and the waiting list is ranked by four named steps, each place with the step that decided it. Every outcome is a code with params, written in English, Finnish, Swedish or Estonian.

## Scenario cards that work

1, 2, 3, 4, 5, 6, 7, 8, 9, 10

| Card               | What the judges compare                                                                                                                                                                                      | Works                                                                                                                                                                                                                                                                                                                                                  | Proved by                                                                                                                                                                                                 |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 Happy path       | Aino, `ebike-003`, 36 months, no down payment: band B, factor 0.027584, net 10 730, VAT 2 736, gross 13 466; the first 3 invoices; January 2027 at 26 % is 13 520; buyout 58 350; the invoices total 486 612 | yes, end to end                                                                                                                                                                                                                                                                                                                                        | `card-01-happy-path.test.ts` "prices band B …", "bills the first three invoices …", "the invoices add up exactly …"; `src/server/scenarios/card-01-08.test.ts` "quote → approved → signed …"              |
| 2 The price lock   | `laptop-004` on v1 (5 Nov, 349 000, rent 9 627) and v2 (6 Nov, 321 100, rent 8 857): which price is locked and why                                                                                           | yes, end to end                                                                                                                                                                                                                                                                                                                                        | `card-02-price-lock.test.ts` "on 6 Nov the quote is valid, locked to v1 …"; `card-02-07.test.ts` "quoted on v1 on 5 Nov, signed on 6 Nov under v2 …" (`price_locked_from_quote` with both versions)       |
| 3 Tax is not price | `ebike-001`, 24 months from 15 Sep 2026: net 6 957; December gross 8 731, January gross 8 766                                                                                                                | yes, end to end                                                                                                                                                                                                                                                                                                                                        | `card-03-tax-is-not-price.test.ts` "the invoice of …"; `card-02-07.test.ts` "ebike-001, 24 months from 15 Sep 2026 (demo day) …"                                                                          |
| 4 Calendar traps   | `laptop-001`, 36 months from 31 Jan 2026: net 3 432; due 28 Feb 2026 and 29 Feb 2028                                                                                                                         | yes, end to end                                                                                                                                                                                                                                                                                                                                        | `card-04-calendar-traps.test.ts` "invoice … is due on …"; `card-02-07.test.ts` "laptop-001, 36 months from 31 Jan 2026 …" (ends 30 Jan 2029)                                                              |
| 5 Too young        | Mikko (17) applies for `laptop-008`: too young until 10 Mar 2027; affordability would pass at 36 and 48 months                                                                                               | yes, end to end                                                                                                                                                                                                                                                                                                                                        | `card-05-too-young.test.ts` "is rejected on 5 Nov 2026 with too_young …"; `card-02-07.test.ts` "card 5 …" (signing refused: `application_not_approved`); `/[locale]/applications/[id]` writes the date    |
| 6 Who can sign?    | Norvi, 1 × `ebike-004` (every item is unique, D8): 549 000 financed, band B, rent 15 144; `awaiting_signatory`, the page says what happens next                                                              | yes, end to end                                                                                                                                                                                                                                                                                                                                        | `card-06-who-can-sign.test.ts`; `applications.test.ts` "card 6"; `card-02-07.test.ts` "card 6 …" (the applicant's signing refused)                                                                        |
| 7 Big ticket       | Haapala, `farm-002`, 48 months, 2 000 000 down: band D, 272 037.5 → 272 038; buyout 1 000 000; the company, farm, revenue, owners and PEP questions; manual review                                           | yes, end to end                                                                                                                                                                                                                                                                                                                                        | `card-07-big-ticket.test.ts`; `applications.test.ts` "card 7"; `card-02-07.test.ts` "card 7 …" (signing refused until the admin decides)                                                                  |
| 8 Early exit       | Card 1 ended in month 7: remaining rents 311 170, market value 311 200, buyout 58 350, the D14 balance line by line                                                                                          | yes: market value by months since lease start (D31, an assumption: a pack item is new at its first lease); buy 330 675, return 75 945 (good, 1 800 km)                                                                                                                                                                                                 | `card-08-early-exit.test.ts` (no todos left); `src/server/scenarios/card-01-08.test.ts` "seven rents paid, preview … then a buy" (29 rents cancelled, 330 675 + 26 % VAT, asset sold, audit chain intact) |
| 9 Second life      | `ebike-007` back fair at 18 400 km: refurbish? who gets it, `wait-02` or `wait-13`? at what rent?                                                                                                            | yes: no refurbishment beyond the mandatory battery 35 000 + inspection 4 500 (our cost); `wait-02` wins (fair is enough, `wait-13` needs 12 000 more for good); relisted at its market value 115 976 (D86, nothing added), 6 497 net a month for 12 months; the demo button assesses it and lands on `/en/assets/ebike-007/second-life`                | `card-09-second-life.test.ts`; `src/server/scenarios/card-09.test.ts`; `src/domain/second-life/match.test.ts`; `src/server/demo-cards.test.ts` "card 9 …"                                                 |
| 10 Third life      | `ebike-008` after 2 lives, good, 9 800 km: lease it again, show the passport and the CO₂                                                                                                                     | yes: assessed (market value 32 601, D86), relisted good, leased 24 months at 1 194 net; the passport shows three lives, 29 kg and 332,80 € (estimated) saved so far on 6 Nov 2026; 58 kg (0 + 29 + 29) and 665,60 € when the third lease ends on 5 Nov 2028; the demo button assesses, quotes, applies and signs it as Olavi and lands on the passport | `src/server/scenarios/card-10.test.ts` "ebike-008 is leased a third time …"; `card-10-third-life.test.ts`; `co2.test.ts`; `src/server/demo-cards.test.ts` "card 10 …"                                     |

## How to run the demo

As in the README [Quick start](https://github.com/ThomasParratt/northfina-lease-loop#quick-start):

```bash
npm ci
npm run db:setup
npm run dev
```

Then open `http://localhost:3000/en/demo`: one **Run** button per scenario card, each landing on the page where the numbers are compared, with the demo clock and "Continue as" set for you (run card 1 before card 8). The 10–12 minute walk through it is [docs/demo.md](https://github.com/ThomasParratt/northfina-lease-loop/blob/main/docs/demo.md).

## Engineering

- [ ] `npm run check:all` passes locally (not re-run for this text; CI runs the same steps, format, lint, typecheck, file size, no-AI, tests and build, and is green)
- [x] CI is green on our last commit (Actions enabled in our fork)
- [x] Review finding 1 fixed: authorization before the action, so the decision page and its signing link are shown only to the applicant and admin (#61, [docs/features/authorization.md](https://github.com/ThomasParratt/northfina-lease-loop/blob/main/docs/features/authorization.md); the finding is in [docs/reviews/wave-3.md](https://github.com/ThomasParratt/northfina-lease-loop/blob/main/docs/reviews/wave-3.md))
- [x] No `--no-verify` was used
- [x] No AI, ML or LLM features inside the app (`npm run check:no-ai`, and `tests/meta-rules.test.ts`)

## Anything else the judges should know?

**Decisions and mentor questions.** Every reading we took is a numbered decision with its reason and what we chose against: [docs/decisions.md](https://github.com/ThomasParratt/northfina-lease-loop/blob/main/docs/decisions.md) (D1 to D90). Every question we put to the mentors is answered and the code follows the answer ([docs/mentor-questions.md](https://github.com/ThomasParratt/northfina-lease-loop/blob/main/docs/mentor-questions.md)): the fleet quantity of card 6 (D8, issue #13), passing on to a named person (D16, issue #54) and the age, price and battery reset a returned item is valued with (D60 and D83). Card 8's curve age (D31) is an assumption stated in the README "Status" section.

**Docs.** One page per feature, each with its rule worked on the scenario-card numbers, its decisions, its pure functions and the tests that pin the numbers:

- [docs/features/catalogue.md](https://github.com/ThomasParratt/northfina-lease-loop/blob/main/docs/features/catalogue.md)
- [docs/features/pricing.md](https://github.com/ThomasParratt/northfina-lease-loop/blob/main/docs/features/pricing.md)
- [docs/features/question-flow.md](https://github.com/ThomasParratt/northfina-lease-loop/blob/main/docs/features/question-flow.md)
- [docs/features/contracts.md](https://github.com/ThomasParratt/northfina-lease-loop/blob/main/docs/features/contracts.md)
- [docs/features/invoicing.md](https://github.com/ThomasParratt/northfina-lease-loop/blob/main/docs/features/invoicing.md)
- [docs/features/exits.md](https://github.com/ThomasParratt/northfina-lease-loop/blob/main/docs/features/exits.md)
- [docs/features/second-life.md](https://github.com/ThomasParratt/northfina-lease-loop/blob/main/docs/features/second-life.md)
- [docs/features/circular-impact.md](https://github.com/ThomasParratt/northfina-lease-loop/blob/main/docs/features/circular-impact.md)
- [docs/features/signatories.md](https://github.com/ThomasParratt/northfina-lease-loop/blob/main/docs/features/signatories.md)
- [docs/features/authorization.md](https://github.com/ThomasParratt/northfina-lease-loop/blob/main/docs/features/authorization.md)
- [docs/features/my-leases.md](https://github.com/ThomasParratt/northfina-lease-loop/blob/main/docs/features/my-leases.md)
- [docs/features/user-portal.md](https://github.com/ThomasParratt/northfina-lease-loop/blob/main/docs/features/user-portal.md)
- [docs/features/demo-cards.md](https://github.com/ThomasParratt/northfina-lease-loop/blob/main/docs/features/demo-cards.md)
- [docs/features/audit-chain.md](https://github.com/ThomasParratt/northfina-lease-loop/blob/main/docs/features/audit-chain.md)
- [docs/features/row-schemas.md](https://github.com/ThomasParratt/northfina-lease-loop/blob/main/docs/features/row-schemas.md)
- [docs/features/test-isolation.md](https://github.com/ThomasParratt/northfina-lease-loop/blob/main/docs/features/test-isolation.md)
- [docs/features/look.md](https://github.com/ThomasParratt/northfina-lease-loop/blob/main/docs/features/look.md)
- [docs/features/README.md](https://github.com/ThomasParratt/northfina-lease-loop/blob/main/docs/features/README.md): the shape every page follows
- [docs/features/STATUS.md](https://github.com/ThomasParratt/northfina-lease-loop/blob/main/docs/features/STATUS.md): the state of every slice

The wave reviews are in [docs/reviews/](https://github.com/ThomasParratt/northfina-lease-loop/tree/main/docs/reviews), the time logs of every task in [docs/log/](https://github.com/ThomasParratt/northfina-lease-loop/tree/main/docs/log).

**How we used AI tools.** The product has no AI; building it did. Claude Code wrote most of the code. We planned the structure and the rules it had to follow, decided how to read every part of the brief (D1–D90), and checked that the logic held up. When it was wrong, we said so: money saved had to be real money, a sunk refurbishment cost shouldn't raise a price, and a clock rule that would have broken the demo stayed out. We tested the app by hand, found the issues and sent the agents back to fix them, and when the organisers answered a question, their rule beat ours.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
