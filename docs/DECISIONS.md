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
  1 Jan 2027 by law: +€Y per month."
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
- **Holds** (one table, `src/domain/holds.ts`): approved application awaiting signature 7
  days, waiting for the company's signatory 7 days, end-of-term nomination 7 days,
  waiting-list offer **3** days (the item sits idle while others wait). A hold is valid
  through its `until` day and lapses the day after. A quote's price is not a hold: valid on
  its day and the next (card 2).
- **Holds lapse by themselves** (6 Nov): an overnight job ends what lapsed — an unsigned
  approval expires and frees its items, an unanswered offer passes to the next person in
  line (whose offer can lapse in turn), an unused nomination ends. In the demo the clock is
  the time-travel bar, so moving it forward runs that job for each day on which something
  lapses, in date order, logged as `system`. Staff can still release by hand.
- **Start date:** chosen by the customer, at most 3 months ahead.
- **Age 18 when applying and signing** (the event hosts, 6 Nov): the data pack's rule says
  "on the contract start date", but nobody may sign a lease as a minor, so the age is checked
  on the day the customer applies (signing is on that day or later). A start date after the
  18th birthday does not help. The form stops at the birth date and says the day they can
  come back (their 18th birthday; 29 February birthdays → 1 March in a common year).
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
  are refused. Card 6's "4 × ebike-004" is a typo in the challenge: the event hosts confirmed
  it means one ebike-004 (6 Nov), and that is what the scenario test runs.
- **Profiles:** persona picker in the header (data customers + staff + "new customer"); the
  selected id is the audit actor. Answers can be saved as defaults; prefill is confirmed in
  groups — basics in one batch, income/employment and PEP each separately.

## Contract and lifecycle

- Locked at signing: net rent, factor, band, buyout amount, price-list version, usage
  purpose. Never VAT.
- Mid-lease the customer may opt to **buy at end of term**: the buyout invoice is issued at
  term end with 30 days to pay, and is excluded from the affordability test.
- **Early exit (tier re-price):** returning in started month k, the customer pays for
  m = max(k, 6) months — **at least 6 months of use**, however early they leave. Those m
  months are re-priced at the cheapest term in the data that covers them (m ≤ 12 → 12,
  ≤ 24 → 24, ≤ 36 → 36, else 48) on the contract's own price basis. Exit cost = that fair
  rent × m − net already paid + a handling fee of **two months** of the re-priced tier's
  rent, capped at the remaining contract payments (leaving never costs more than staying),
  floored at 0, plus VAT at the exit date. At k = term the cost is 0 (a plain return). The
  full calculation is always shown. Card 8 (month 7 of 36): 7 × €213.17 − €751.10 paid +
  2 × €213.17 = €1,167.43 net, €1,470.96 with 26 % VAT.
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
  the skip is logged as "nominated by previous lessee". Their 7 days start when the item
  **comes back** (6 Nov): nominated during the lease, the hold is provisional to 7 days
  after the term ends and restarts on the actual return day (end of term or early exit);
  nominated after the return, 7 days from then; a buyout ends it. The item still goes
  through the second-life desk (mandatory work, re-price), which then holds it for the
  nominee instead of matching the waiting list. Unused, it goes to the waiting list.

## Second life

- **Residual value:** original price = the asset's price in price list v1; age counted from
  1 Jan of `model_year`; linear interpolation between curve points, last value held; times
  the condition multiplier; usage adjustment capped — all per `data/residual-curves.json`.
- **Usage: two counters** (6 Nov, `src/domain/usage.ts`). Every item keeps its **lifetime**
  km / battery cycles / engine hours (never reset; the catalogue and passport show it) and
  its usage **since the last reset** — a new battery for e-bikes and laptops, a major
  service for farm machines. Thresholds read the since-reset counter. Market value reads
  the counter the wear follows: since the last battery where the data says battery work
  resets usage (e-bikes, laptops), the lifetime hours otherwise (an engine does not get
  younger with a service). Usage grows at every return: the customer enters each item's
  meter reading (never below its lifetime total) and the difference is added to both
  counters and noted on the passport. The data pack gives one number per item: it is the
  lifetime total, and farm machines are assumed serviced on schedule (farm-005: 4,200 h,
  200 since the last service).
- **Refurbishment:** mandatory items always (safety inspection, data wipe, battery past its
  threshold — a new battery resets the since-reset counter, so its usage factor is back to
  1.00× — and a farm machine's major service, one per started 1,000 hours since the last).
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
  served from the join date). An offer holds the item (or a whole set for a multi-item
  waiter) for 3 days; accepting starts a normal application at the second-life price, no
  down payment, preferred term. Declining or not answering takes the person off the list
  and passes the item to the next person in line at the same price. The customer's page
  shows offers in their own section and what they still wait for; entries they left,
  declined or leased drop off, and the place in the queue is not shown (it moves for
  reasons the customer cannot see).
- **Multi-item waiters (6 Nov, replacing pooling):** nothing is ever held back for an
  incomplete set. Someone who wants n items wins only when the whole set is free at the same
  moment — the item at hand plus refurbished items already listed in the catalogue that fit
  them too — and then the set is offered together. Otherwise they are skipped for that item
  ("fits, but wants a set") and it goes to the next person in line at once. When a declined
  set is passed on, its own items count, so it can go whole to the next person who wants
  that many. The budget is compared with the rent of ONE item.
- **Matching:** filter by category, minimum condition, budget ≥ new rent, deadline not past;
  then **first come, first served** on `joined_on` (field added to the data for this).
- **Passport:** every lifecycle change appends an AssetEvent; the asset page shows the full
  history and the CO₂ avoided per life:
  `manufacturing_new_kg × (1 − refurbishment_share_of_new) × remaining-value fraction`.

## Cross-cutting

- **Dates look the same everywhere** (6 Nov), day first. Shown: "06 Nov 2026" (two-digit
  day, three-letter month in the reader's language, four-digit year; never 06/11 vs 11/06
  ambiguity). Typed: "06.11.2026" in our own field with a calendar button, because a
  browser's built-in date input formats by the browser's language (mm/dd/yyyy on a US
  browser) whatever the page language. Times (the audit log) add Helsinki "14:05". Stored
  and sent as ISO everywhere (`src/i18n/format.ts`).
- Every domain function takes an ISO date; `src/server/today.ts` supplies "today", and an
  as-of override doubles as the demo's time-travel mode. Time travel only moves forward,
  by +1 day / week / month or a jump to a later date (contracts, invoices and offers are written on their day, so going back would contradict
  the records); "Reset demo" rebuilds the database from the data pack in one audited
  transaction and restarts on 1 Jan 2026, the first day of price list v1, so every scenario
  card can be replayed going forward. The demo controls sit in their own bar above the nav.
- App-side asset states add `leased`; every `reserved` is backed by a Reservation row
  (who, why, until when).
- All the repo rules in RULES.md apply: pure tested domain code, integer cents, API
  envelope, `withAudit()` for every write, 4 locales, files under 600 lines, conventional
  commits, `npm run check:all` green.
