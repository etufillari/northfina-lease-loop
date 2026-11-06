# Time log: the monthly share instead of "Monthly factor"

Real clock, Helsinki. Coding session: Opus, in the main checkout, branch `feat/price-monthly-share` cut from `main` at `b11c060`. From Panu: "Monthly factor" in "Your monthly payment" means nothing to a customer, and a long label must still fit the box.

| When             | What                                                                                                                                                                                                   |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 2026-11-06 12:20 | Test first: `formatMonthlySharePercent` (27 584 millionths → 2.7584, the language's decimal mark, four decimals kept).                                                                                 |
| 12:30            | Step 2's line: label "Paid each month", hint "a share of what we finance", value "2.7584 %", as the buyout line already reads; the note says the percentage includes the interest. Keys in four files. |
| 12:40            | Checked live in four languages at desktop width and 375 px: one line per label after shortening fi, sv and et to one word (Kuukausiosuus, Månadsandel, Kuuosa).                                        |
| 13:00            | Split from the passport card work into its own branch; `pricing.md` updated; `npm run check:all`.                                                                                                      |

## Blocked

Nothing.

## Left undone

- The contract page and the staff views keep "band B · factor 0.027584" on purpose (staff read the data pack's terms).
