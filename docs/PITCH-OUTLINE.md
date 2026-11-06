# Lease Loop — four-minute pitch draft

Use this as slide copy and speaking notes. Reserve most of the four minutes for the live product. Claims below distinguish current demo behavior from future work.

## Slide 1 — One asset, several lives (0:00–0:25)

**On slide:** Lease Loop · Lease → return → refurbish → lease again

**Say:** “A returned bike or laptop should be the start of another useful life. Lease Loop connects the customer agreement, billing and workshop history so the same physical item can be leased again with a new price.”

## Slide 2 — The working loop (0:25–2:10, live demo)

**On slide:** Customer agreement → invoices → physical return → workshop → company approval → next customer

**Show:** Select an approved customer and an available asset. Quote and sign. Open My leases and show the saved rent and invoices. Sign in to the company workshop to generate invoices. In customer My leases use “Demo: finish this lease” and confirm; the completed lease shows explained Return, Pass on and Buyout choices. In the customer view choose Return, enter usage and submit the request. Enter Company operations, show its return notification, confirm physical receipt, inspect, confirm required work and approve the proposal. Open its used offer, switch customers and create the next lease. Show that the asset ID is unchanged and contract IDs differ.

**Say:** “Ending the contract does not mean the item has arrived. The operator records receipt and completes required work before the asset becomes available again.”

**Current behavior:** Company approval is required before publication. Workshop completion alone keeps the item unavailable. Company access uses a separate development password/session; it is not production staff authentication.

## Slide 3 — Locked rent, dated tax (2:10–2:50)

**On slide:** Net rent stays fixed · VAT follows the invoice date

**Say:** “A price promise must survive new price lists. We save the agreed contract terms. For the challenge’s fictional Finnish VAT change, invoices dated in 2027 use 26%, while 2026 uses 25.5%. The net rent stays unchanged; the tax explains the difference in the total.”

**Show:** The scenario-3 December/January invoice comparison, in the read-only invoice forecast, once rehearsed. Do not imply the challenge’s fictional VAT change is real legislation.

## Slide 4 — Money and dates you can explain (2:50–3:25)

**On slide:** Integer cents · Explicit rounding · Monthly calendar rules

**Say:** “Money is stored in integer cents. Monthly anniversaries follow the original start day, clamped when a month is shorter. A January 31 lease reaches February’s last day and returns to the original day when possible. We test leap years, boundaries and thousands of generated schedules.”

**Evidence:** Current automated suite has 301 tests across 50 files, including 2,880 deterministic generated schedule cases. Recheck these counts if the code changes.

## Slide 5 — What we chose and what comes next (3:25–4:00)

**On slide:** Return notifications · Traceable history · Company approval

**Say:** “The same item keeps its identity across lives. The passport records actual contracts and workshop events; imported history is labeled. Our first priority is a dependable loop and explainable calculations. Company approval now controls publication, and customers cannot run workshop or demo engine mutations. Production staff accounts and payment integrations are future work.”

Do not claim real payments, production identity, multi-asset fleet contracts or verified environmental savings. Impact uses fictional challenge factors; waiting-list matching is advisory.

## Q&A preparation

- Why can the total change if price is locked? Net rent is locked; VAT is resolved at invoice date.
- Who wins a matching tie? Feasible requests sort by deadline, then stable request ID.
- What happens to a low-value return? Confirmed work is saved, but no finance offer is published; the asset stays unavailable for pricing review.
- What prevents repeated actions? Stored idempotency receipts and atomic audited writes.
- Does it use AI? No AI/ML/LLM features inside the product; calculations use rules and data.

## Rehearsal

Use one tested asset/customer pair and a prepared date example. The UI follows the system light/dark theme; check contrast and screen projection on the presentation laptop before rehearsing. Keep a second browser tab ready for the next customer and invoice comparison. If a live request fails, show the last saved state and explain it; do not improvise database resets during the pitch.
