# Challenge cards — verified results and demo

6 November2026, local branch `feat/circular-lease-loop`. See [PROGRESS.md](PROGRESS.md) for current status. These are tested prototype behaviors, not claims of production lending/payment readiness.

## Results

| Card               | Verified behavior                                                                                                                                                                                                                                                 | Evidence / scope                                                                                                                                                                                    |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1 Happy path**   | Aino/ebike-003, Nov5 v1,36 months: net10730 cents; first3 gross13466/13466/13520. Scheduled rent net386280; optional buyout58350; net total if bought444630. Down payment/buyout shown separately; future VAT is not promised fixed.                              | `src/domain/scenario-cards.test.ts`, real contract/invoice tests and account UI                                                                                                                     |
| **2 Price lock**   | Real v1 quote saved Nov5 and signed Nov6 keeps v1 rent and price version. Fresh v2 quote is cheaper for laptop-004.                                                                                                                                               | `src/server/circular/lifecycle.test.ts`, scenario tests; honor saved offer through expiry                                                                                                           |
| **3 VAT**          | ebike-001 Sep15 start: December2550bps; January2600bps; signed net unchanged. Issued tax snapshots retained.                                                                                                                                                      | Scenario tests and invoice tests;2027 change is fictional                                                                                                                                           |
| **4 Calendar**     | Jan31 start → Feb28 2026 / Feb29 2028 issue dates;14-calendar-day terms → Mar14 due in both cases. March restores31st.                                                                                                                                            | Calendar tests, including2880 deterministic generated contracts                                                                                                                                     |
| **5 Too young**    | Mikko is rejected; UI gives an18-at-start explanation. Consumers and sole traders use age on the agreed start date.                                                                                                                                               | Scenario/application tests and translated rejection text                                                                                                                                            |
| **6 Who can sign** | Norvi remains manual review and cannot sign; submitted answers cannot upgrade authoritative signing authority.                                                                                                                                                    | Guard tested, including four-times rent. **A real4-asset fleet application is not implemented**; contracts still identify one physical asset                                                        |
| **7 Big ticket**   | Haapala farm-002,48 months,2000000 cents down: financed12500000; high-ticket company questions apply; PEP requires manual review.                                                                                                                                 | Scenario and question-flow tests. No auto-approval by changing a known PEP flag                                                                                                                     |
| **8 Early exit**   | New signed policy caps fee at min(remaining net rents, signed end buyout), no admin fee. Month7 means6 elapsed periods: remaining321900, cap/fee58350 cents for card1; effective May5 2027. Future rent blocked.                                                  | End-option integration tests. Charges are obligations, not fabricated payments. Already issued future rent requires credit handling before exit; legacy contracts without agreed policy fail safely |
| **9 Second life**  | ebike-007 fair/18400km: fair→good12000 + battery35000 + safety4500 =51500 cents. All steps confirmed before release; replacement resets current usage per pack, prior reading retained. Feasible demand ranks by deadline then stable ID: wait-02 before wait-13. | Domain/server tests and real HTTP/workshop smoke. Matching is advisory; no persisted queue assignment or global profit optimizer                                                                    |
| **10 Third life**  | ebike-008 retains2 imported lives and starts a new third-life contract/lease. Passport shows real persisted events plus labeled imported summaries. Good-condition third life estimates290400g avoided manufacturing.                                             | Circular integration tests and real HTTP/workshop smoke. Fictional factors; earlier individual leases are not invented                                                                              |

## Full spine proof

Actual HTTP calls and rendered account/workshop HTML were checked on a freshly migrated isolated SQLite database:

**First application → signing/activation →3 saved invoices → completion → physical return → inspection → required work confirmations → published used price → second customer's application/signing → new active lease and invoice.**

Same assetId/serial, distinct contract/lease IDs. Request replays return stored results. Incomplete work keeps allocation held; audit failure rolls changes back. The first contract's rent/invoices survive second-life repricing unchanged. Buyout and pass-on API actions were also exercised.

This verifies the real server/render path, not a visual browser/keyboard audit. Manual accessibility and4-minute rehearsal remain.

## Pricing/refurbishment assumptions

- All money is integer cents. Decimal factors become exact rational integers; half-up rounding at the final cent. Contract net total is term × rounded monthly net.
- Used value: linear age curve × inspected/restored condition × bounded full-step usage adjustment. Jan1 of model year is an explicit conservative age proxy because manufacture dates are absent.
- Mandatory work is coded by named pack rules, never evaluated from arbitrary text. Standard release restores at least good condition. The current farm service policy conservatively counts started1000-hour intervals from the reported counter; prior unrecorded service is unknown.
- Used offer is residual market value after confirmed work; costs are shown separately, not silently added twice. Low residuals below the financing minimum require manual handling and do not auto-release.
- Matching: category, budget, minimum condition, requested term and deadline; earliest deadline then ID. No fabricated signup timestamps.
- Impact: avoided manufacturing only, discounted for poor/fair condition; fictional pack factors. No commuting savings are double-counted.
- Pass-on uses checked handover/inspection and a new customer's contract, not rewriting an existing customer. Buyout removes the asset from leasable stock and records an unpaid obligation.

##4-minute demo script

1. Choose Aino; pick an available e-bike,36 months, zero down; complete questions and sign.
2. Account → generate the next invoices. Show locked net, January VAT change, total net and optional buyout. Repeated generation continues the schedule in batches of up to3.
3. Complete at contractual end (demo timeline), choose return, then open **Circular workshop and asset passports**.
4. Register return; save condition/usage inspection; confirm each required work checkbox; publish the ready used offer.
5. Go to catalogue and select Lena; open the SAME asset's offer, sign and generate its invoice. The explicit asset timeline starts no earlier than refurbishment readiness.
6. Show passport/history and optionally imported ebike-007/008 examples.

Run `npm run dev -- --webpack`; account/workshop controls are development-only. Migrations have been applied additively to local dev.db. No reset of existing business data was performed.

## Smart-problem focus now

Primary pitch: **1 Lock price, not tax** and **5 Money that adds up**. They integrate directly with the spine and have strong tests. Early-exit policy, matching, passport and fictional impact are additional demonstrated rules; disclose their simplifications instead of claiming a complete production optimizer.
