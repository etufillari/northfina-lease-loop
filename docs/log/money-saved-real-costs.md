# Time log: money-saved-real-costs (issue #40, after the #72 revert)

Branch `feat/money-saved-real-costs`, 2026-11-06. #68 counted money saved with the 12 % refurbishment share from `co2-factors.json`; Johannes: the 12 % is not money. #72 reverted it.

| Time  | Step                                                                                                                          |
| ----- | ----------------------------------------------------------------------------------------------------------------------------- |
| 10:50 | Brought #68 back on top of the revert; the cost per life is the `refurbished` event's `costCents` (the assessment)            |
| 11:00 | Tests first: real costs, a life floored at 0, the `always` steps per category, card 10 at 33 280 and 66 560                   |
| 11:10 | Past lives: Johannes chose the known costs (the `always` steps) and the word "estimated", no '+'; the 24-month estimate stays |
| 11:20 | Server reads, passport and landing text in four languages; checked live: 314,80 € (estimated) for card 10 on 5 Nov            |
| 11:30 | D80 rewritten, feature page, README estimate note, STATUS.md                                                                  |

Superseded: #71 (the review follow-up to #68). Left undone: none in scope.
