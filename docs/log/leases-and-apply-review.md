# Time log: Panu's review of My leases, applying and the demo menu

Real clock, Helsinki. Coding session: Opus, in the main checkout, branch `fix/leases-and-apply-review` cut from `main` at `66b523d`. Eight findings from Panu, solved together for one review; one commit per finding.

| When             | What                                                                                                                                                                                                        |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-11-06 13:30 | Read the code behind the eight findings.                                                                                                                                                                    |
| 13:50            | 8: the demo page's jump buttons are `HashLink`s. 5: "why we ask" for the customer type and the e-bike use rewritten in four languages. 3: "Price fixed on" and a plain note on the contract page.           |
| 14:05            | 2: one card per lease with its ways out in a strip, early exit in the danger colours. 4: the exit form asks the condition and usage only for a return or pass-on, empty until answered; a buy asks neither. |
| 14:20            | 6: test first, then the name against the record (D89). 7: test first, then `customer_signs` (D88); two tests that pinned the admin signing updated.                                                         |
| 14:45            | 1: test first, then `withdrawn` (D87): domain rule, row schema, service, route, OpenAPI, the button on the decision page and the leases lists; signing re-reads the decision in its transaction.            |
| 15:05            | Docs: D87–D89, six feature pages; `npm run check:all`; checked in the browser.                                                                                                                              |

## Blocked

Nothing.

## Left undone

- A withdrawn company case keeps its signing link; opening it now answers that the case is already decided rather than "withdrawn".
- The price page's stored-quote view still writes "Price list · Version n" (staff and judges compare versions there for card 2).
