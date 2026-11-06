# Time log: application feedback (why we ask, the decision page)

Real clock, Helsinki. Coding session: Opus, in the main checkout, branch `feat/application-ux` cut from `main` at `a271bca`. From Panu's frontend feedback list, items 12, 13 and 15.

| When             | What                                                                                                                                                                                      |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-11-05 23:50 | "Why we ask": teal, as wide as its text, an info glyph and a chevron that turns when open.                                                                                                |
| 23:55            | Decision page: no "Why" card on a yes, no status badge in the card (the panel above says it), the polite title on a no, buttons back home and to the catalogue. Checked live, both cases. |
| 00:00            | Feature page, this log.                                                                                                                                                                   |

## Blocked

Nothing.

## Left undone

- An approved application has no "Sign the contract" button on its page: signing exists only as `POST /api/contracts`. Raised with Panu as the next step.

Closed by the wave 3 upkeep, 2026-11-06 05:39: the task is merged; the Sign button it left came with #47 (`1bac3ac`).
