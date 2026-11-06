# Time log: pass on starts the next deal (D90)

Branch `feat/pass-on-new-deal` from `origin/main` d629666. Agent on Claude Opus. Brief: Johannes's
decision D90, a pass-on charges no refurbishment and starts the next person's quote in the same
exit transaction; the main case is card 8 passed on early in month 7.

| Time (Helsinki) | Step                                                                                                                     |
| --------------- | ------------------------------------------------------------------------------------------------------------------------ |
| 14:41           | Branch and `npm run setup`.                                                                                              |
| 14:44           | Tests first: pass on 71 445 without the refurbishment line, the early pass-on bills 71 445 (failing). Committed.         |
| 14:46           | `passOn` option in `earlyExitCost`, `exitBilling` bills it for a pass-on. Green.                                         |
| 14:48           | `nextDealQuote` (pure, with tests); `createQuoteInTx` on the caller's `tx`; `exitContract` relists and stores the quote. |
| 14:50           | Server tests: the quote at 259 230 in the transaction, a throwing handler and an unpriced quote roll everything back.    |
| 14:53           | UI: pass on beside return with the refurbishment at 0, the ended contract links the next quote; messages in all four.    |
| 14:55           | Scenario: card 8 passed on early, the next person applies for and signs the new quote. OpenAPI regenerated.              |
| 14:56           | D90 row, `docs/features/exits.md` paragraph, this log.                                                                   |

**Chosen:** the item is relisted `available` inside the exit (the assets slice's `relistReturnedAsset`)
rather than letting the quote path accept a `returned` item: quote, application and signing all
require `available`, so none of them changed.

**Left undone:** the next quote is not tied to the named customer in the database (a Quote row has
no customer; the name is in the exit's audit entry), so another customer could apply for it in
its 14 days. The signing's price lock reads the item's assessment for a second-life price; a
passed-on item has none, so a quote that expires would be re-priced at the list price.

## Review of PR #89 (Thomas), 2026-11-06

| Time (Helsinki) | Step                                                                                                                                  |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| 15:05           | Merged `origin/main`, read the review.                                                                                                |
| 15:07           | `planExit` refuses a pass-on below `good` (`pass_on_below_leasable`), test first in `exit-plan.test.ts`.                              |
| 15:08           | `Quote.customer_id` (nullable, `npm run db:migrate`); apply and sign refuse another customer (`quote_reserved_for_another_customer`). |
| 15:09           | The pass-on writes `repriced` and sets the item `reserved`; the named customer's signing leases it from `reserved`.                   |
| 15:10           | My leases shows "Passed on to you"; the leaver's contract keeps a line without a link. Keys in all four languages. Tests green.       |
| 15:14           | `docs/features/exits.md`, D16 (superseded in part) and D90 rows, this log.                                                            |

**Done:** review points 1 to 3. The "left undone" above about the quote not being tied to the
customer is fixed by `customer_id`.

**Left undone:** the quote's expiry does not release the hold: the item stays `reserved` until the
admin sets it `available` by hand (written in D90 and the feature page's open questions).
`nextQuoteIdOf` still reads the quote id from the audit entry for the leaver's info line.
