# Spine demonstration and review

Run this against a disposable local database containing the supplied synthetic fixtures.
The demonstration date selector affects the journey API. The catalogue still uses today's
Helsinki date, so a release dated in the simulated future is not yet today's catalogue price.

## First integrated slice

1. Open `/en/lease/ebike-003`, select Aino and business date 2026-11-05.
2. Choose 36 months, no advance, start 2026-11-05. Inspect monthly net 10730 cents.
3. Save the offer, answer every applicable question, and submit the application.
4. Review the server-loaded saved offer and approved application; consent, then sign.
5. Reload. The same agreement and immutable terms must remain.
6. Issue November, then move to 2026-12-05 and issue December, then to 2027-01-05
   and issue January. Gross amounts must be 13466, 13466 and 13520 cents.
7. Repeat the issue command. No duplicate period or extra audit mutation may appear.

## Complete the loop

1. Move to the displayed maturity date. Issue all remaining due periods.
   The later issue date intentionally determines VAT for these overdue documents.
2. Return the asset with an explicit condition and nondecreasing usage reading.
3. Observe that it is unavailable for a new lease while it needs preparation.
4. In the labelled demo operator step, complete the computed required tasks and record
   a new net valuation and its reason. Submit once with the current release revision.
5. Select a different eligible synthetic customer, review a new offer and new answers,
   then sign a separate agreement for the same asset ID.
6. Inspect the passport: the previous life remains, the new life has a separate agreement,
   and former customers' private documents and answers are absent.
7. Repeat on independent fixtures for buy and pass-on. A bought item cannot be re-leased;
   a passed-on item is reserved for its nominated successor, who must still qualify and sign.

## Price change

For laptop-004, quote on 2026-11-05 with a start date of 2026-11-06. Its supplied v1 net
price is 349000 cents. Sign on 2026-11-06: the valid saved v1 offer remains the agreement
source, even though a fresh catalogue quote uses the supplied v2 literal, 321100 cents.
An expired offer requires a new visible review, never silent substitution.

## Gates before submission

- Run `npm run check:all` in the real team checkout.
- Run commitlint for the entire actual PR base-to-head range; check:all does not include it.
- Verify real remote CI at the final head SHA and the official open submission PR.
- Use all four locales, keyboard navigation, zoom and narrow screens; inspect focus,
  visible labels, loading/error states and numbers without relying only on colour.
- Test reload after saving an offer, signing, issuing invoices and relisting.
- Explain the code with another teammate: inputs, invariants, side effects, failures and tests.
- Review the team's two selected Smart Problems separately; this foundation does not
  declare the team choice or claim every optional scenario is implemented.

## Four-minute structure

- 0:00–0:35: item and price breakdown, term/down-payment controls.
- 0:35–1:15: applicable questions, a clear decision, explicit consent.
- 1:15–2:05: saved agreement, reload, the three invoice amounts across January.
- 2:05–3:15: return, required preparation, new price and a different customer's agreement.
- 3:15–4:00: passport, one correctness proof and the team's selected deeper problems.

Use a prepared synthetic state only when labelled as such. Do not present seeded state as
an operation just performed. Keep independent buy/return/pass-on cases and a permitted
backup recording. A demo selector is not a production login, and an invoice is not proof
of payment. Imported unknown lives are counts, not reconstructed contracts or measured CO2.
