# Lease Loop: product and engineering decisions

Merged from three team design docs on 5 Nov 2026. This is the source of truth; if code
and this file disagree, fix one of them. Smart Problems claimed: **#1 VAT, #2 early exit,
#3 second life, #4 question flow, #5 money**.

## Pricing

- **Terms:** 12 / 24 / 36 / 48 months only — exactly what `data/coefficient-table.json` prices.
- **Down payment:** 0–30 % of the net list price, and the financed amount must stay ≥ €300
  (band A minimum). UI: slider in 1 % steps plus a free euro input, both validated.
- **Too cheap / too expensive:** items outside the €300–€250,000 financed range stay in the
  catalogue, greyed out with the reason ("below the €300 lease minimum"), checked against the
  price list valid on the as-of date.
- **Rounding (the one rule):** the monthly factor is held as integer parts per million
  (0.027584 → 27584). Contract net total = financed × factor_ppm × term / 1,000,000, kept
  exact in cents and rounded **half-up once**. The monthly net rent is rounded half-up; the
  **last invoice absorbs the leftover cents**, so the sum of all invoices equals the contract
  total exactly. VAT is rounded half-up per invoice.
- Worked check (scenario card 1): €3,890.00 × 0.027584 → net rent 107.30 €/month,
  gross 134.66 € at 25.5 % VAT, buyout 583.50 €.

## VAT

- The net rent is locked at signing. **VAT is charged at the rate valid on the invoice due
  date** (`data/vat-rates.json`), so the 1 Jan 2027 change (25.5 % → 26 %) raises the totals
  of later invoices.
- The UI explains it neutrally: "Your rent is locked at €X. VAT rose from 25.5 % to 26 % on
  1 Jan 2027 by law: +€Y. Northfina does not keep this."
- Catalogue shows net prices with a VAT/net toggle. Once the customer type is known,
  consumers see VAT-inclusive prices by default, businesses net.

## Calendar and invoices

- Due dates are anchored to the start day and clamped to the last day of shorter months,
  never shifted permanently: start 31 Jan 2026 → due 28 Feb 2026, 29 Feb 2028 (leap year).
- Full months only, no pro-rating. Billed in advance: invoice N is due at start + (N−1) months.
- The whole schedule is created at signing with fixed net amounts; future invoices show as
  "scheduled" with VAT at the rates currently known. Weekends and holidays do not move dates.

## Quote → application → contract

- A **quote** locks the price-list version. It is valid through the end of the **next**
  calendar day (card 2: quoted Thu 5 Nov on v1, signed Fri 6 Nov → the v1 price is locked,
  and the app says why).
- **Holds are 7 days** everywhere: approved application awaiting signature, waiting-for-the-
  signatory, a waiting-list turn, a second-life offer.
- **Start date:** chosen by the customer, at most 3 months ahead. The 18-year age rule is
  checked on the start date; a decline says when the applicant can come back.
- **Question flow:** a pure engine evaluates `ask_when` from `data/questions.json` — nothing
  hard-coded. One question at a time. Changing an earlier answer deletes answers whose
  questions no longer apply; changing the deal re-evaluates the thresholds and asks what
  newly applies. Eligibility = the six rules in the data file, each result with reasons.
  Blocking answers stop the form at once; a PEP "yes" flags manual review but never blocks.
- **Affordability (consumers only):** monthly rent incl. VAT ≤ 30 % of monthly net income.
  Income unknown (not asked under €2,000 financed) → passes, with that stated as the reason.
  The price slider warns live and suggests parameters with "a better chance of approval"
  (longer term first, then a larger down payment); it never hard-rejects before an application.
- **Business ID:** check digit validated as the field is typed (mod-11 rule, weights
  7 2 4 8 5 10 9); a submitted invalid ID declines the application.
- **Can't sign:** the application is approved-pending-signature, the contract goes to the
  signatory's e-mail, and staff can "sign as signatory" (audit-logged). 7-day hold.
- **Fleets:** assets are unique physical items, so a fleet is a group of DISTINCT assets of
  one category, picked on the fleet page and priced as ONE contract banded on the total
  (that total is what band and question thresholds see). Duplicates and mixed categories
  are refused.
- **Profiles:** persona picker in the header (data customers + staff + "new customer"); the
  selected id is the audit actor. Answers can be saved as defaults; prefill is confirmed in
  groups — basics in one batch, income/employment and PEP each separately.

## Contract and lifecycle

- Locked at signing: net rent, factor, band, buyout amount, price-list version, usage
  purpose. Never VAT.
- Mid-lease the customer may opt to **buy at end of term**: the buyout invoice is issued at
  term end with 30 days to pay, and is excluded from the affordability test.
- **Early exit (tier re-price):** returning in started month k, the k months used are
  re-priced at the cheapest term in the data that covers them (k ≤ 12 → 12, ≤ 24 → 24,
  ≤ 36 → 36, else 48) on the contract's own price basis. Exit cost = that fair rent × k
  − net already paid + a handling fee of one month of the re-priced tier's rent, capped at
  the remaining contract payments, floored at 0, plus VAT at the exit date. At k = term the
  cost is 0 (a plain return). The full calculation is always shown.
- **Return inspection (designed, deferred — not in the code):** the usage purpose from
  `q_usage_purpose` is locked on the contract at signing, and the monthly price is never
  adjusted for a self-declared purpose. Wear is internalized through second-life
  re-pricing instead: a returned item's new financed amount is its market value from
  `data/residual-curves.json`, so actual km lower what the next customer pays and the
  residual risk stays with Northfina. The full inspection — a wear charge only for
  abnormal use (expected residual value, age curve × "good" × normal usage, versus
  actual), **delivery use** doubling the allowed usage, battery wear counted as
  refurbishment and never a customer charge — is designed but not implemented.
- **Pass it on:** (a) mid-lease transfer — the lessee shares a link; the recipient goes
  through the normal question flow against the remaining schedule (no down payment, locked
  rent carries over) and the contract transfers on approval; (b) end-of-term nomination —
  the named person may apply for a new lease on that item, skipping the waiting list, and
  the skip is logged as "nominated by previous lessee".

## Second life

- **Residual value:** original price = the asset's price in price list v1; age counted from
  1 Jan of `model_year`; linear interpolation between curve points, last value held; times
  the condition multiplier; usage adjustment capped — all per `data/residual-curves.json`.
- **Refurbishment:** mandatory items always (safety inspection, data wipe, battery past its
  threshold; a new battery resets the usage counter, so its usage factor is back to 1.00×).
  Northfina pays for the work, so every piece of it must pay for itself against the
  alternative (6 Nov, replacing "gain exceeds cost" only):
  - an item worth less after its mandatory work than that work costs → kept for parts;
  - at most **one** condition upgrade per return, and only when it pays: on an item that is
    listable already (`good`+, ≥ €300) the value it adds must exceed its cost — so a good
    item nobody takes can become like-new; on an item that cannot be listed without it, the
    value after all the work must reach €300 and exceed everything spent on it;
  - a worthwhile upgrade serves a waiter first, else the catalogue. Under €300 after all
    that → kept for parts.
- **Re-price:** financed = the **market value after the work** (condition after any upgrade,
  usage after any reset), through the normal bands. The work is not added on top: that
  charged a new battery twice, once in the higher value and again as a cost (6 Nov). Card 9:
  ebike-007 → wait-02 at €64.97/month for 12 months (financed €1,159.76).
- **Waiting list:** customers join in the app (one place per category, first come first
  served from the join date). An offer holds the item (or a full set for a multi-item
  waiter) for 7 days; accepting starts a normal application at the second-life price, no
  down payment, preferred term. Declining or not answering takes the person off the list
  and passes the item to the next person in line at the same price.
- **Matching:** filter by category, minimum condition, budget ≥ new rent, deadline not past;
  then **first come, first served** on `joined_on` (field added to the data for this).
- **Passport:** every lifecycle change appends an AssetEvent; the asset page shows the full
  history and the CO₂ avoided per life:
  `manufacturing_new_kg × (1 − refurbishment_share_of_new) × remaining-value fraction`.

## Cross-cutting

- Every domain function takes an ISO date; `src/server/today.ts` supplies "today", and an
  as-of override doubles as the demo's time-travel mode.
- App-side asset states add `leased`; every `reserved` is backed by a Reservation row
  (who, why, until when).
- All the repo rules in RULES.md apply: pure tested domain code, integer cents, API
  envelope, `withAudit()` for every write, 4 locales, files under 600 lines, conventional
  commits, `npm run check:all` green.
