# Price Guardian

Price Guardian is an optional draft-price assistant, not a credit decision or a new
pricing engine. It uses the current offer, coefficient table and invoice-date VAT
forecast already used by Explain My Price. It never edits saved offers or contracts.

## Policy

Keep the same physical item, offer price/source, term, start date and tax assumptions.
Search zero down payment and the down payments corresponding to the minimum and maximum
financed amounts of each coefficient band. Deduplicate these candidates and keep only
nonnegative amounts below the customer's current down payment, reaching a different band.

Price every candidate through the existing calculator and full payment explanation.
Recommend only when:

- upfront payment and monthly net rent do not increase;
- full-term cost to use the item is lower, both net and forecast including VAT;
- full-term cost including optional purchase is also lower, both net and including VAT.

The optional buyout itself can be higher: show it separately, never hide that trade-off.
Choose the largest forecast saving to use, then the largest saving including purchase,
then the smaller upfront payment. This is the best of the checked candidates, not a
claim to find the global optimum across every cent or term. Rounding stays in the
existing integer-cent money functions. No extra interest or repair fee is introduced.

Missing tax data or invalid current inputs suppress suggestions. No suggestion does
not mean the selected price is optimal. A suggested price does not establish application
eligibility, reserve an asset or guarantee future VAT. The ordinary application checks
still apply after a new offer is explicitly saved.

## Interaction

Show the current and suggested payments side by side, including net upfront payment,
monthly net rent, forecast totals to use and to buy, and the optional buyout. Explain
the coefficient-band change. All displayed gross totals are estimates using the same
scheduled invoice dates; actual invoice issuance may change VAT.

The customer explicitly chooses the suggestion. This changes only the existing draft
and returns focus to the upfront field. The existing save action remains separate.
Editing price inputs or changing persona, business date, offer or language must never
leave an actionable stale suggestion. Use the existing four locale dictionaries and
starter components; do not introduce another theme, API or persistence model.

## Independent review example

On 5 November 2026, laptop-003 costs EUR 2,000 net. At 36 months:

| Amount, integer net cents               | EUR 50 upfront | Zero upfront |
| --------------------------------------- | -------------: | -----------: |
| Financed amount                         |         195000 |       200000 |
| Monthly rent                            |           5582 |         5517 |
| Upfront plus full-term rent             |         205952 |       198612 |
| Optional purchase                       |          29250 |        30000 |
| Upfront plus rent and optional purchase |         235202 |       228612 |

Zero upfront saves 7340 net cents to use or 6590 net cents including purchase, despite
its larger optional buyout. With the supplied dated VAT forecast, savings are 9225 and
8280 gross cents respectively. The optional purchase rises from 36855 to 37800 gross
cents. These are independent test expectations, not asset-specific product branches.

## Demo

1. Open `/en/lease/laptop-003`, select Aino and business date **5 November 2026**.
2. Select **36 months**, start **5 November 2026**, and enter **50** upfront.
3. Compare the Guardian's suggestion: EUR 0 upfront, EUR 55.17 monthly net instead of
   EUR 55.82. The estimated gross saving is EUR 92.25 to return or EUR 82.80 to buy.
4. Read the higher-buyout warning. Select the suggestion with the keyboard. Only the
   upfront draft changes; focus returns to its field. No quote is saved yet.
5. Use the ordinary save button. The saved quote must match the newly displayed terms.
6. In a separate unsaved draft, try **0.01** upfront. Try an invalid amount, then change
   the business/start date to **6 November**: the changed catalogue price must not retain
   yesterday's recommendation. No suggestion is a guarantee of the best possible price.

## Code map

- `src/domain/price-guardian.ts`: bounded candidate search using the shared price engine.
- `src/components/spine/price-guardian.tsx`: comparison, assumptions and explicit choice.
- `src/components/spine/price-panel.tsx`: integration with the existing draft/save flow.
- `src/i18n/messages/guardian/`: EN/FI/SV/ET copy, covered by existing parity tests.

## Verification scope

Cover the one-cent and EUR 50 band traps, nonzero boundary alternatives, invalid and
out-of-range inputs, date/VAT gaps, no improvement, and a candidate that is cheaper to
use but more expensive to buy. Verify four-locale output, keyboard selection, draft-only
changes, server-side saving of the selected offer and unchanged prior records.

Run the unchanged core CI and the complete feature commit-message range. Record the
actual final revision and checks when implementation is complete.
