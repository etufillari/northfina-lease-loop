# Time log: fix/single-units

The organisers answered on 2026-11-06: every item is unique, card 6 is 1 × `ebike-004` and is about the signing flow, no quantities or multi-item contracts. Johannes: no multiples in the UI or the API. Time-box 120 minutes, freeze 15:00.

- 08:32 start on `main` 1672ec7, branch renamed to `fix/single-units`; `npm run setup` and `npm run db:setup` in the background.
- 08:36 pricing: `QuoteInput` loses `quantity`, `perUnit`, `splitEvenly` and `invalid_quantity` go; the breakdown keeps `quantity: 1` from the stored column so signing's D76 guard still reads it. Tests first in `quote.test.ts` (card 6 at 549 000, band B, 15 144) and `financeable.test.ts` (ebike-010 refused on v1).
- 08:40 API: the quote body (strict) and the preview query drop `quantity`; `createQuote`, the preview, the contract's re-pricing and the demo trip schema price one unit. A route test pins that a body with `quantity` is 400. OpenAPI regenerated.
- 08:40 a subagent (Opus) rewrote the scenario tests that crossed thresholds with several units (`answers-hardening`, `plausibility`, `question-flow.property`, `quote-schedule.property`, `fixtures`, `drills`): one item at the edge, with a down payment where needed (PEP at farm-008 − 290 000, revenue at farm-002 − 9 500 000).
- 08:45 UI: no quantity field in the calculator, no "× N" or per-item line in the breakdown, contract summary and signing page; D78 notice on the asset page and "Not leasable on this price list" on the catalogue card; message keys in four languages.
- 08:50 the card 6 application page: the coordinator saw the admin's "Demo outbox" card saying "No signatory is named" (the link is admin-only). Added "What happens next" for everyone (who it waits for, the three steps, nothing to do now); the outbox is admin-only. Checked in the browser on the demo card 6 run and on `ebike-010` with the clock on 5 Nov.
- 08:55 question-flow tests (engine, eligibility, answers) at 549 000; docs: decisions D8 (decided), D41 (replaced), D76 (guard), D78 (new); pricing, question-flow, signatories, demo-cards, authorization, catalogue feature pages; README Status row 6; demo script; mentor question 1 answered; kickoff brief rows marked superseded.

## Left undone

- `quantity_over_consumer_cap` (D48) and `data/consumer-limits.json`'s `max_consumer_quantity` stay in the domain with their unit tests, but no quote can reach them any more. Removing the rule is a follow-up for the team to decide.
- The `quantity` columns of `Quote` and `Contract` stay (always 1, no migration), as the brief asked.
