# Decision log

Every product, domain and engineering decision, in the order it was made. It is the source for the pitch, so a decision is logged in the same PR as the change.

**Adding an entry:** take the next `D-NNN`, add a row to the index and write the entry below. Never rewrite an old entry: mark it `Superseded by D-NNN` and add a new one. Each entry covers context, decision, alternatives, why, consequences and evidence (bugs caught, test results) where they apply.

## Index

| ID    | Date       | Area     | Decision                                                                      |
| ----- | ---------- | -------- | ----------------------------------------------------------------------------- |
| D-001 | 2026-11-05 | Strategy | Build in the fork; the starter's tooling and conventions win                  |
| D-002 | 2026-11-05 | Pricing  | Rent comes from the coefficient table, not our own annuity model              |
| D-003 | 2026-11-05 | Product  | Smart Problems: 1 (VAT), 5 (money adds up), 6 (explain my price)              |
| D-004 | 2026-11-05 | Product  | No agent or MCP integration                                                   |
| D-005 | 2026-11-05 | Domain   | One rounding rule: `roundHalfUp`, half away from zero, noise-proof            |
| D-006 | 2026-11-05 | Testing  | Expected values come from hand calculations, never from the code              |
| D-007 | 2026-11-05 | Testing  | `src/domain` held to 90 % coverage, above the 60 % project gate               |
| D-008 | 2026-11-05 | Workflow | Protected `main`: every change is a squash-merged PR with green CI            |
| D-009 | 2026-11-05 | CI       | CI pinned to `ubuntu-24.04` for the hackathon                                 |
| D-010 | 2026-11-05 | Workflow | Rebase-merge PRs so every small commit stays in the history                   |
| D-011 | 2026-11-05 | Pricing  | A quote is net; VAT is added at the rate on each invoice date                 |
| D-012 | 2026-11-05 | Pricing  | Down payment in 10 € steps, bounded so the financed amount fits the table     |
| D-013 | 2026-11-05 | Pricing  | Follow the table at band edges, even when more down raises the rent           |
| D-014 | 2026-11-05 | Contract | Signing locks a valid quote; a cheaper price today is offered, never forced   |
| D-015 | 2026-11-05 | Domain   | Dates are ISO strings; calendar maths in UTC in one module                    |
| D-016 | 2026-11-05 | Invoices | Bill on the start day in full months; the billing rule is frozen per contract |
| D-017 | 2026-11-05 | Testing  | Property-based tests prove every schedule adds up exactly                     |

---

## D-001 · Build in the fork

- **Context:** Before kick-off we prepared a separate repo with workflow tooling and a pricing engine, planning to merge the starter into it. The starter's README requires the submission to be a pull request from a fork.
- **Decision:** All work happens in our fork. We use the starter's stack as it is: npm, Node 22, Next.js 16, Prisma with SQLite, its hooks, CI and conventions. From the prep we carry over habits and small helpers only.
- **Alternatives:** Merge the starter into the prep repo (wrong direction for a fork PR). Port our stricter tooling (pnpm, Node 24, a fixed commit-scope list) on top (churn for no product gain).
- **Why:** The judges run the starter's checks. Fighting them costs time and points.

## D-002 · Rent from the coefficient table

- **Context:** Our prepared engine priced leases as an annuity down to a residual value. The data pack defines rent as `financed amount × factor`, with the factor picked by amount band and term, and a buyout as a percentage of the financed amount.
- **Decision:** Pricing follows `data/coefficient-table.json` exactly. The prepared annuity engine is dropped.
- **Why:** The worked example in `data/DATA.md` and the scenario cards are defined against the table. A bank trusts its own price table over our model.
- **Consequences:** The prep lesson that sliders must only offer valid quotes still applies: terms are 12/24/36/48 months, and the down payment must keep the financed amount inside a band.

## D-003 · Smart Problems 1, 5 and 6

- **Decision:** Go deep on 1 (lock the price, not the tax), 5 (money that adds up) and, as a lighter third, 6 (explain my price).
- **Alternatives:** 4 (question flow) is needed for the Spine anyway, so it gets a solid but not deep version. 2, 3 and 7 are left for later if time allows.
- **Why:** 1 and 5 both live in the invoice schedule, which the Spine needs regardless, and both reward rigorous testing (scenario cards 3 and 4, property-based tests). 6 reuses the price breakdown that the quote and contract pages show anyway.

## D-004 · No agent or MCP integration

- **Context:** We considered an MCP server as the wildcard, so a dealer's or bank's AI assistant could request quotes.
- **Decision:** Not built.
- **Why:** Letting an external agent act on financing data raises security and legal questions in banking that a hackathon can't answer responsibly, and it blurs the "no AI in the product" rule.

## D-005 · One rounding rule

- **Context:** The data pack leaves rounding to us. Floating point turns some exact halves into values just below them: 163 845 × 0.7 is 114 691.49999…, and 1.005 € × 100 is 100.49999…, so plain `Math.round` rounds them down. This bit us twice during prep.
- **Decision:** `roundHalfUp` in `src/domain/money.ts` trims the value to 6 decimals, then rounds half away from zero. Every rounding point (rent, VAT, buyout) uses it, once per amount.
- **Alternatives:** Banker's rounding (unusual on consumer invoices). A decimal library (another dependency for one function).
- **Why:** One rule, written once, tested once. Away from zero means a credit note mirrors the invoice it cancels.
- **Evidence:** Tests pin the worked example from `DATA.md` (rent 10 730.176 → 10 730, VAT 2 736.15 → 2 736) and both float-noise halves.

## D-006 · Independent expected values

- **Decision:** Every expected number in a test comes from the data pack's worked example, a hand calculation or a textbook value, noted next to the assertion. Tests go through each module's public functions, not its internals.
- **Why:** A test that recomputes the answer the same way as the code can never fail. Testing at the public seam lets us refactor freely.

## D-007 · Higher coverage bar for the domain

- **Decision:** `vitest.config.ts` keeps the project-wide 60 % gate and adds 90 % lines, functions and statements and 85 % branches for `src/domain`.
- **Why:** The domain holds the money. CI fails as soon as a business rule ships untested.

## D-008 · Protected main

- **Status:** Merge method superseded by D-010.
- **Decision:** `main` on the fork only changes through pull requests with a green `ci` check, squash-merged so each feature is one conventional commit.
- **Why:** The submission PR shows our whole history. One green commit per feature reads cleanly, and a broken `main` is impossible.

## D-009 · CI pinned to ubuntu-24.04

- **Context:** GitHub started moving `ubuntu-latest` to Ubuntu 26.04 in October 2026, overlapping the hackathon.
- **Decision:** The CI job runs on `ubuntu-24.04`.
- **Why:** The runner image can't change under us between our last push and judging.

## D-010 · Rebase merges keep the small commits

- **Context:** D-008 chose squash merges out of habit. The starter's rules say small, frequent commits tell the judges our story, and the README says the history shows who built what. Squashing collapses each PR into one commit and hides the test-first red, green, refactor steps.
- **Decision:** PRs into the fork's `main` are rebase-merged. Squash and merge commits are turned off in the repo settings. `main` stays protected with a required green `ci` check and linear history.
- **Alternatives:** Squash (one tidy commit per feature, but the story is lost). Merge commits (keeps commits but breaks linear history).
- **Why:** Every commit already passes the hooks and commitlint, so each one is safe to land on `main` as it is.

## D-011 · A quote is net; VAT follows the invoice date

- **Context:** Smart Problem 1. The net rent is locked at signing, but Finnish VAT rises from 25.5 % to 26 % on 1 January 2027 (`data/vat-rates.json`).
- **Decision:** `quoteLease` returns only net amounts: financed amount, band, factor, monthly rent, buyout and totals. `vatRateOn(rates, date)` and `withVat(net, rate)` in `src/domain/vat.ts` add VAT for a given date, rounded once per amount (D-005). The buyout is left out of the total cost because buying is optional.
- **Alternatives:** Store a gross rent in the quote (wrong as soon as the rate changes during the lease).
- **Why:** The same net rent produces 13 466 cents gross in 2026 and 13 520 in 2027. Keeping VAT out of the quote makes that impossible to get wrong.
- **Evidence:** Tests pin both VAT boundaries (2024-08-31/09-01 and 2026-12-31/2027-01-01) and the DATA.md worked example.

## D-012 · Down-payment slider bounds

- **Context:** The data pack sets no down-payment rule, only that the financed amount must fit a band (300 € to 250 000 €).
- **Decision:** The down payment moves in 10 € steps (`DOWN_PAYMENT_STEP_CENTS`, in `src/domain/pricing-rules.ts`). `downPaymentBounds` allows from max(0, price − 250 000 €) rounded up to a step, to price − 300 € floored to a step. `quoteLease` accepts exactly those values.
- **Alternatives:** A fixed cap such as 30 % of the price (our prep rule, but nothing in the data supports it).
- **Why:** The slider can never produce a quote the API would refuse.
- **Evidence:** A test sweeps every step for six prices and checks the bounds and `quoteLease` agree. The data-pack traps fall out of it: farm-006 (260 000 €) needs at least 10 000 € down; ebike-010 can't be leased on 5 Nov (289 €) but can on 6 Nov, when price list v2 makes it 303 €, with no room for a down payment.

## D-013 · Follow the table at band edges

- **Context:** The factor drops at each band edge. Financing 200 000 cents costs 5 517 a month over 36 months (band B), but 199 999 cents costs 5 725 (band A). So 0.01 € more down payment raises the rent by 2.08 €. laptop-002 and laptop-003 sit on exactly this edge.
- **Decision:** Price strictly by the table. The price explanation (Smart Problem 6) will tell the customer when a smaller down payment would move them into a cheaper band.
- **Alternatives:** Quietly charge the cheaper of the two bands (deviates from the bank's own table).
- **Why:** The table is Northfina's pricing. Our job is to apply it faithfully and make the effect visible.
- **Evidence:** A test pins both sides of the edge.

## D-014 · Signing locks the quote; a cheaper price is offered

- **Context:** Scenario card 2. laptop-004 is quoted on Thu 5 Nov at 349 000 (price list v1) and signed on Fri 6 Nov, when v2 makes laptops 8 % cheaper (321 100).
- **Decision:** A quote records its price-list version, the coefficient table and every amount, and stays valid for 7 days (`QUOTE_VALID_DAYS`). Signing a valid quote copies it into a frozen contract. Before signing, `priceCheckAtSigning` re-quotes the same terms for today: if the rent would be lower, the customer is offered the new quote; if higher, the quote protects them.
- **Alternatives:** Always price on the signing day (simpler, but a quote becomes meaningless). Lock the quote silently (customer overpays 770 a month on card 2 without knowing).
- **Why:** A quote is a promise the customer can rely on, and a bank shouldn't profit from a customer not noticing a price drop. Comparing the monthly rent, not the list price, keeps it right at band edges (D-013).
- **Consequences:** The contract stores where every number came from, so the UI can explain the locked price. An expired quote can't be signed; the customer gets a fresh quote.
- **Evidence:** Card 2 test: locked at 9 627/month (v1), offered 8 857/month (v2), saving 770.

## D-015 · ISO dates and one calendar module

- **Decision:** Dates travel as ISO strings (`YYYY-MM-DD`). Arithmetic lives in `src/domain/calendar.ts` and runs in UTC. An impossible date such as 2026-02-30 throws, because it can only come from a bug.
- **Why:** UTC can't lose or gain a day to time zones or daylight saving. The invoice schedule (31st starts, leap years) will build on the same module.

## D-016 · Start-day billing, frozen per contract

- **Context:** Smart Problem 5 and scenario cards 3 and 4. When is an invoice due for a lease starting on the 15th or the 31st, and is the first month a full month?
- **Decision:** Contracts store a billing rule, frozen at signing like the price. The first rule, `start_day_full_months`, bills in advance on the start day each month. In a shorter month it moves to the last day (31 Jan → 28 Feb, 29 Feb in 2028) and returns to the 31st afterwards, because every date is counted from the start, never from the previous invoice. Every invoice covers a full month at the same net rent. The invoice date is the due date, and VAT follows it (D-011). `invoiceSchedule` in `src/domain/invoicing.ts` is the only code that decides invoice dates.
- **Alternatives:** Bill on the 1st with prorated first and last months. It's tidier for a bank's billing run and shows more rounding work, but it costs more time today and is harder to explain on a first bill.
- **Why:** Same bill every month is the easiest thing for a customer to trust, and the total adds up by construction. Storing the rule per contract means a second rule (billing on the 1st) can be added later without touching signed contracts.
- **Evidence:** Card 4: due 28 Feb 2026, back on 31 Mar, and 29 Feb 2028. Card 3: the net rent stays 6 957 while VAT moves from 1 774 (Dec 2026) to 1 809 (Jan 2027).

## D-017 · Property-based tests for the schedule

- **Decision:** `fast-check` (dev dependency only) generates random contracts: any start day from Sep 2024 to 2030, any term, any rent up to 10 000 €. For each, the tests check one invoice per month, contiguous periods without gaps or overlaps, net total = rent × term, gross = net + VAT on every invoice, totals equal the sum of the invoices, and the VAT rate matches the year.
- **Why:** The brief calls property tests the gold standard for Smart Problem 5. They test rules that any billing rule must keep, so a future proration rule must pass the same suite.
- **Evidence:** Each property runs on 100 random contracts per test run, in CI on every push.
