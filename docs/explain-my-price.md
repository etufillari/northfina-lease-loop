# Explain my price — Smart Problem 6

This feature extends the working Spine with a readable price breakdown and a comparison
of two lease terms. It uses the existing pricing and invoice rules; it does not add a
second calculator, an AI service or a new quotation API.

## Information and behaviour

Show the monthly payment for a named invoice date, its net amount and VAT, then the
upfront payment and the full cost under two outcomes: return the item after using it,
or buy it at the end. The optional purchase must remain a separate, visible amount.

Explain the calculation as item price minus upfront payment equals amount financed;
amount financed times the supplied coefficient gives the rounded monthly net rent.
The financed amount is not another payment. The coefficient is not an interest rate.

Both comparison options use the same item, current price source, upfront amount, start
date and tax data. Changing a comparison or choosing a term only edits the draft.
Saving an offer remains a separate action and does not reserve or sign for the item.
Saved offers retain their original net terms when the current catalogue price changes.

All gross totals are estimates using scheduled invoice dates. The upfront forecast uses
the selected business date; the optional purchase forecast uses the term-end date.
Actual invoice issuance can change VAT. The supplied 2027 VAT change is fictional.
No fees, refundable deposits, guaranteed future taxes or market values are invented.

The UI must explain a financing-band change without promising that more upfront always
means lower rent. Invalid amounts, dates, unsupported terms and missing tax data need
specific recovery text and must not leave a valid-looking previous price on screen.

## Independent example for review

For `ebike-003`, list price 389000 cents, zero upfront, start and forecast upfront date
2026-11-05, using the supplied v1 price and coefficient table:

| Amount (cents)                                  | 24 months | 36 months |
| ----------------------------------------------- | --------: | --------: |
| Monthly rent before VAT                         |     13822 |     10730 |
| First monthly payment including VAT             |     17347 |     13466 |
| Monthly payment from January 2027 including VAT |     17416 |     13520 |
| Estimated total to use                          |    417846 |    486612 |
| Optional purchase before VAT                    |     97250 |     58350 |
| Estimated optional purchase including VAT       |    122535 |     73521 |
| Estimated total including purchase              |    540381 |    560133 |

The 36-month option has a smaller monthly payment and a higher total under either
outcome. These figures are test oracles, not fixture-selected application behaviour.

## Short demo

1. Follow the [quick start](../README.md#quick-start), then open
   `/en/lease/ebike-003`. Choose Aino and set the demo date to **5 November 2026**.
2. Keep zero upfront and a start date of 5 November. The selected 36-month term starts
   at **€134.66 including VAT**. The VAT timeline shows **€135.20** from January 2027.
3. Compare 24 and 36 months in the table. Both use the same dated price and assumptions.
   Try 12 and 48 months with the comparison selectors. Choosing an option updates the
   draft; only **Save these terms and continue** creates an offer.
4. For the band trap, open `/en/lease/laptop-003` on the same demo date, choose 36 months
   and enter **0.01** upfront. Financing moves from band B to A; monthly net rent rises
   from **€55.17 to €57.25**. The notice explains the coefficient change. The effect is
   calculated from the inputs, not from the asset ID.
5. For the price-source check, open `/en/lease/laptop-004` on 5 November and choose a
   start date of **6 November**. Save the offer, then change the demo date to 6 November.
   The saved explanation retains **€3,490.00 net and price list 1**. Choosing different
   terms opens the current **€3,211.00 net, price list 2** offer instead.

The screen uses all four locale dictionaries. The existing draft store preserves the
chosen lease terms; the two comparison selectors have their own per-item, per-persona
preferences. Neither comparison nor switching languages creates a business record.

## Code map

- `src/domain/price-explanation.ts` groups the existing scheduled invoices and exposes
  their net/gross amounts. `price-comparison.ts` prices common inputs for each term and
  provides the zero-upfront reference when the financing band changes.
- `src/components/spine/price-panel.tsx` owns form presentation and save eligibility.
  The explanation, VAT timeline, comparison and band notice each have a separate file.
- `saved-price-explanation.tsx` reads frozen quote terms and their original source.
  It uses the current assumed invoice date only for the advance's VAT forecast.
- New domain tests cover independent arithmetic examples, missing tax periods, calendar
  boundaries and both directions of a band change. The database integration test links
  comparison, saving and the actual saved-offer component, including four-locale output.

The feature adds no database migration, API endpoint, package dependency or pricing
formula. It continues through the existing audited quote/application/contract services.

## Runtime integration correction

An HTTP check found that Next.js can normalize a loopback URL to `localhost` or expose
its bind hostname in `Request.url`. Comparing only that URL with the browser's Origin
incorrectly rejected a same-origin save opened through `127.0.0.1`.

The origin guard now compares the serialized Origin's protocol and authority with the
request protocol and actual Host header, falling back to the URL when Host is absent.
It keeps different hosts, schemes and ports separate and ignores `X-Forwarded-Host`.
Real `NextRequest` regression cases cover loopback normalization and spoofed headers.

## Acceptance checks

Verify both terms against the example, a one-cent band crossing, dated VAT changes,
source/version changes, incomplete tax data and invalid input. Confirm that comparison
does not create a quote, contract, invoice or audit row. Save the chosen option through
the existing audited service and check that its terms match the displayed breakdown.

Check keyboard controls, narrow screens, light/dark colour schemes and all four locales.
Changing language must retain the selected terms. Run the existing full quality gate,
keep hooks enabled and record the actual local and remote results before delivery.
