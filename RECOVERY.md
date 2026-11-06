# Returns, assessment and second-life offers

The customer journey is **My leases → open lease → guided condition check → staff inspect → customer pays → staff receive → ready to relist → price review → second-life catalogue offer**.

The condition check uses the recorded starting condition and lifetime usage, then asks how each part actually behaves, with answers written for that part, plus battery health, new cosmetic damage and accessories. One running amount stays visible: what the customer would pay. Existing wear and ordinary light use are not charged again.

**What the customer pays, policies `condition-v3` and `settlement-v3`:** the cost of ending early plus their share of repairs plus unpaid rent, added together.

- **Ending early** is what is still owed today minus what the item is worth to us after the work every return needs, never more than the remaining rent. It falls as the lease goes on: leaving at month 2 of 36 costs more than at month 30. The return screen has a slider that recalculates this for any month.
- **Repairs** come from the part each answer points to. Laptops use prices by price class in `src/domain/laptop-parts.ts`: demo figures set inside the ranges published by [Which?](https://www.which.co.uk/reviews/finding-a-tradesperson/article/how-much-do-laptop-and-computer-repairs-cost-aj2mz8y6SD9C), [a German repair shop](https://macinrepair.de/en/prices/), [a London shop](https://www.laptoprepairfix.co.uk/laptop-repair.htm) and [a UK guide](https://nearmetrades.uk/guides/it-and-consultancy/laptop-repair-costs-work-guide). They are not supplier quotes. Other categories still use a share of the original price.
- **Share of repairs** falls evenly from 100 % at the start of the lease to 50 % at the end, because the lease has paid for most of the item and its parts are older. It is our demo policy.
- **Battery** is judged against age. We replace below 80 %, and charge only below what age explains: 95 % minus 1.25 points a month, never below 60 %. So 70 % after two months is charged and 70 % after two years is not. The rule is ours; published figures only suggest about 80 % after three to five years.

Repairs are never charged above what the item was worth.

**The price from the return form is the price.** When the form is submitted, the server recalculates the amount from the customer's answers and saves it with the report; it ignores any price a client sends. Inspection does not change it, so the customer sees the same ending-early and repair lines on every screen. Inspection records the item and our own costs, and those costs are the only thing its repair lines affect. Each suggested cost starts from what the customer was quoted for that part. Unpaid rent is added at its current amount, because it comes from the invoices: rent paid in the meantime is not charged again. The trade-off is deliberate, to keep the journey simple: damage the customer did not report is our cost, not theirs. A report with no answers, such as an older one, has no agreed price, so its quote still comes from the inspection, including the new-damage lines staff mark.

Relisting shows the work, what the customer pays toward it and what we keep.

**Paying:** on a demo lease the customer pays the quote with a simulated payment, recorded once per assessment as a receipt separate from monthly invoices. Unpaid rent in the amount is settled with it. A paid return cannot be cancelled. A non-demo lease only accepts the quote, because no real payment service exists.

**Buyout is self-service:** open Buy this item, review the discounted-rent/residual/tax breakdown, choose a simulated payment method, and confirm payment. No condition form or staff approval is required. An audited, idempotent settlement receipt is stored separately from monthly invoices. Unpaid and accrued rent included in the buyout is settled once; the contract becomes bought. Real contracts cannot be closed through simulated payment.

**Exchange starts with the replacement:** choose an available item and term, complete the same condition check on the current item, then review its estimated return settlement and the replacement's gross monthly price. Submission saves an exchange request and a server-derived replacement quote. Inspection still confirms the old item's settlement. The replacement is not reserved or leased by this request: its new application and checkout remain required before a new financial commitment.

Staff have a floating Admin shortcut when signed in with their staff role. The shortcut does not bypass authorization.

## Staff access

The admin overview is at `/en/staff` and the requests queue at `/en/staff/returns` (also fi/sv/et). Both pages and mutation APIs check the signed-in staff role. A staff link appears in the account menu only for staff. Customers cannot assign themselves a role through the application.

For local development, grant an existing account access:

```bash
npm run staff:grant -- your-email@example.com
```

If your local database contains exactly one account, `npm run staff:grant -- --only-local-user` selects it. Provisioning is audited and refuses production mode. This is a local command, not a web endpoint or password bypass.

## Reports and assessment

Reports collect condition, lifetime usage, relevant faults, missing accessories, notes and a preferred return date. Laptops include screen, keyboard and battery issues; bikes include brakes, tyres, battery and drive; farm machinery includes engine, hydraulic and service issues.

A report is not an inspection. Staff complete the itemized inspection described below, then confirm age and target condition. Inspection notes are optional. The saved quote contains the inputs, age/original-price baseline, tax and finance rate, line-item work costs, outputs and policy versions. Customer responses omit private inspector notes and identity.

For legacy assets missing the original price/date, the earliest recorded contract supplies the price baseline and staff document age. This is an estimate, not proof of the original new-item value. New contracts preserve the original baseline and financing rate; a later lease never restarts the item's age.

## What the inspection records

The form is built from what dealers, lease companies, machinery buyers and IT refurbishers actually record. It adapts their practice to our three categories; it is not a claim of compliance with any of these documents.

| Field                                 | Why it is there                                                                                | Based on                                                                                                                                                                                                                                                                                                                                     |
| ------------------------------------- | ---------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Serial number check                   | Proves this is the item on the contract                                                        | [Nissan CPO checklist](https://www.nissanusa.com/content/dam/Nissan/us/shopping-tools/certified-pre-owned/167%20CPO%20Checklist.pdf) item 1, [ATTRA tractor checklist](https://blog.uvm.edu/groundwk/files/2016/05/ATTRA-checklist-for-used-tractors.pdf), [Macfox e-bike checklist](https://macfoxbike.com/blogs/news/used-ebike-checklist) |
| Usage reading, and how it was taken   | Value depends on it, and a customer's word is weaker than a meter                              | [BVRLA lease returns](https://www.bvrla.co.uk/home/consumer-advice/returning-your-leased-vehicle), Nissan, ATTRA                                                                                                                                                                                                                             |
| Customer present                      | Lease inspections recommend it, because charges may be disputed                                | BVRLA                                                                                                                                                                                                                                                                                                                                        |
| Accessories, keys and service history | Missing items are a separate, chargeable finding                                               | BVRLA, ATTRA                                                                                                                                                                                                                                                                                                                                 |
| Result per check                      | Nissan's "meets standard / adjust or repair / not applicable", plus normal wear and not tested | Nissan, BVRLA                                                                                                                                                                                                                                                                                                                                |
| E-bike checks                         | Frame cracks, brakes, battery case, wheels, motor at every assist level, display errors        | Macfox                                                                                                                                                                                                                                                                                                                                       |
| Laptop checks                         | Ports, keyboard, trackpad, screen, battery and wireless, the usual refurbisher test list       | [Refurbishment overview](<https://en.wikipedia.org/wiki/Refurbishment_(electronics)>), [retailer grading guide](https://systemliquidation.com/blogs/news/what-do-refurbished-computer-grades-mean)                                                                                                                                           |
| Machinery checks                      | Roll-over protection, PTO guard, fluids, hydraulics, hitch links, cold start and load test     | ATTRA, [buyer checklists](https://www.yesapproved.com.au/tractor-buyers-inspection-checklist/)                                                                                                                                                                                                                                               |
| Measurements                          | Real forms record numbers, such as Nissan's pad thickness per wheel                            | Nissan, ATTRA                                                                                                                                                                                                                                                                                                                                |
| Damage log with responsibility        | The core lease question: normal wear is not charged, damage from an event can be               | BVRLA                                                                                                                                                                                                                                                                                                                                        |
| Grade limit from the worst finding    | Auctions cap frame-damaged vehicles at a low grade, whatever else looks good                   | [NAAA grading scale](https://www.naaa.com/Policy/Vehicle_GradingScale.html)                                                                                                                                                                                                                                                                  |

Rules that follow from the findings:

- Every check needs an answer, and its repair cost is entered as a line. The server totals the lines; the browser never sends a repair total.
- The worst finding limits the grade: structure or identity → poor (a laptop hinge counts as a function fault, not structure), safety or function → fair, paperwork, accessories, any wear or any logged damage → good, otherwise like new. The server rejects a better grade.
- The sources set no thresholds that carry across categories, so no numeric reading fails an item. The one exception is a prompt, not a rule: a battery under 80 % suggests a replacement, a common refurbisher benchmark that varies by seller.

Known gaps: photos are not stored, there is no data wipe record or re-test log, and the customer does not countersign the inspection.

## Relisting

Confirming physical receipt moves the item straight to `ready` and publishes nothing. There is no separate sign-off: the inspection already lists the work, which keeps the demo to one assessment per item. A real business would add back a completion record, including a NIST SP 800-88 data wipe record per drive.

**Put back on the market** then shows the new price before anything happens: the VAT-inclusive price, an example monthly payment, the original price, the work cost, the price minus work, any drop since the quote and a warning for a loss or a price too low to finance. Confirming sends the price staff saw. The server recalculates it and refuses with `PRICE_CHANGED` if the two differ, so an aged quote cannot be published unseen. A price below the financing table cannot be published at all.

## Admin overview

`/en/staff` leads with what is waiting for staff, then four views over the same months: revenue, active leases, active leases by category and revenue by category.

- **Revenue** is net of VAT: issued rent invoices by due month, down payments by start month and recorded buyouts by payment month. Unpaid invoices count; forecasts and return settlements without a recorded payment do not. Checkout does not issue invoices yet, so a new lease moves the lease charts at once but rent appears only when an invoice is recorded.
- **Active leases** are counted at each month's end, and today for the current month.
- The current month's revenue is a running total, so it is shown as a separate hollow dot rather than a collapse in the line.

### Simulated history

`npm run db:seed` writes 24 months of history as ordinary rows: fictional customers without logins, contracts, invoices, simulated payments, buyouts, events and an audit entry for each lease. `src/domain/demo-history.ts` plans it using the same pricing, billing and settlement functions as real leases, with fixed demand tables and no randomness. History leases sit on `isFleetHistory` items that never reach the catalogue, checkout or public API.

It also opens real cases on data-pack items through the real services: the six returned items end up exactly as the data pack describes them, two of them ready to relist, and three leased items await assessment. Scenario cards 9 and 10 depend on this, since `ebike-007` and `ebike-008` otherwise have no lease to recover. Items already used in your database are skipped, running it again changes nothing that day, and production skips it entirely. Prices from before the first price list are marked version 0.

## Versioned demo formulas

All internal money is integer net euro cents; customer amounts include applicable VAT. This is an explicit simulated commercial policy, not a claim of regulatory or accounting compliance.

### Recovery policy `recovery-v1`

- Age factor: linearly interpolate the category points in `data/residual-curves.json`; hold the last point after the curve ends.
- Usage factor: apply the category penalty per completed usage step, capped by the table's maximum reduction.
- Value: original first-lease net price × age factor × condition multiplier × usage factor. Preserve exact intermediate fractions and round the final valuation half up to one cent.
- Refurbishment cost: chained condition improvements + mandatory safety/data-wipe tasks + triggered battery/service tasks + the professional's additional repair quote.
- Net recovery: post-repair estimated value minus refurbishment cost. Work expense is kept separate; spending money on a repair does not automatically increase market value by the same amount.
- Published second-life net price: the post-repair value, recalculated for the relist date because an item keeps ageing after its quote. The same quote engine, eligibility checks and VAT rules apply when it is leased again.
- Lifetime usage never resets. A completed battery replacement or major service advances a separate maintenance baseline, avoiding charging for the same service repeatedly.

The professional decides whether to publish after the item is received. If recovery is unsuitable, a received item can be retired instead. An economic loss is visible rather than hidden; the decision to proceed remains a staff decision. Waiting-list matchmaking is not implemented in this workflow.

### Settlement policy `settlement-v3`

Let `M` be locked monthly net rent, `B` the contractual net buyout, `n` future unissued payment periods and `r` the snapshotted nominal annual rate divided by 12. Issued payments are excluded from that future balance; unpaid issued invoices and past unissued accrued rent are added once, separately, as gross balances.

```text
remaining rent value = sum(M / (1 + r)^k), k = 1..n
buyout net = remaining rent value + B / (1 + r)^n
financial return shortfall = min(remaining rent value, max(0, buyout net - net recovery))
return net = financial return shortfall + customer's share of repairs
```

At the agreed end (`n = 0`), ordinary return settlement is zero for normal wear; confirmed new damage is still payable and buyout is `B`, before arrears and VAT. The customer is not charged to restore pre-existing cosmetic wear. New/like-new items may reach good condition through normal use. Staff confirm the incremental repair charge; customer estimates remain provisional. Without a price agreed in the return form, an itemized inspection's incremental damage cost is the larger of the grade-drop cost and the damage lines logged as the customer's responsibility, and the customer can see each of those lines. The financial early-return shortfall is capped at discounted remaining rents so the provider retains residual-value risk. Worth is measured before damage repairs, so adding the customer's share of repairs does not count them twice. No arbitrary administration fee or second damage charge is added. The same damage must not reduce recovery value and also create an unitemized duplicate charge.

Discounting uses integer rational arithmetic; round each final net quote half up to cents. Apply the quote-date standard VAT policy once and then add already-gross outstanding issued invoices and past accrued unissued rent once. Real settlement tax treatment would need a separate reviewed policy. Existing contracts without a saved finance rate explicitly use the current coefficient table as a legacy fallback, recorded in the quote.

A quote expires at the end of its quote date. Staff can refresh it; a price agreed in the return form stays the same. Customer payment must match its exact assessment version. Once paid, the settlement snapshot is frozen for subsequent physical receipt. Self-service buyout writes an explicitly simulated settlement receipt; non-demo contracts require a real recorded settlement-payment integration first.

## Lifecycle and data guarantees

- A request alone leaves the lease active.
- Staff assessment produces a quote, not a physical return or completed repair.
- Customer payment does not mark the item received.
- Physical receipt closes the original lease and increments prior lives once, while keeping its financial snapshot.
- Received and retired items stay unavailable. Publication requires a reviewed price and creates an assessed offer revision.
- Catalogue and checkout use that offer rather than falling back to the original new-item list price.
- Checkout reserves the physical item and locks the new agreement values. An idempotent retry returns the existing lease instead of creating another one.
- Every transition uses `withAudit()` in one transaction, including role and ownership checks. Conflicting active leases block receipt.

Calculations live in `src/domain/asset-recovery.ts`, `inspection.ts`, `relist-offer.ts`, `lease-settlement.ts`, `asset-offer.ts`, `company-metrics.ts` and existing billing functions. Server services load data, check authorization and save snapshots; the UI presents the results rather than trusting browser-supplied amounts.
