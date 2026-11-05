# Lease Loop: small roadmap

Goal: one asset completes a lease, returns, gets refurbished and is leased again. Keep the same asset ID throughout.

Read [architecture](01-SYSTEM-ARCHITECTURE-AND-CONTRACTS.md), [ownership rules](TEAM-AI-RULES.md), and [work steps](03-TEAM-EXECUTION-AND-TASK-BREAKDOWN.md).

## Build in this order

1. **Catalogue → signed contract.** Use existing pricing work; application gets approved/rejected/reviewed with reasons. Save the signed net rent and price version. Owner: spine developer.
2. **Contract → monthly invoices.** Engine calculates dates and net/VAT/gross from signed terms. Add audited persistence and duplicate protection next. Owner: engine developer.
3. **Close → return → refurbish → second offer.** Mandatory work gates readiness. Reuse existing asset identity. Owner: circular developer.
4. **Connect and demonstrate.** Replace mocks with real services. Activate a second contract on the same asset, then show its invoice and audit history. All three integrate their boundaries.
5. **Harden and submit.** Run `npm run check:all`, test retries and reloads, check four locales and keyboard flow. Follow README submission instructions.

## Two smart problems to focus on

- **Locked net rent, changing VAT:** December2026 and January2027 use different rates while agreed net stays fixed. Also show a saved quote crossing the price-list change; agree quote expiry/signing policy with the spine owner.
- **Money and calendar correctness:** integer cents, explicit rounding, Jan31/leap dates, and totals that equal the sum of monthly rents.

Basic eligibility and second-life reuse remain required. Advanced matching, CO₂, elaborate dashboards and early-exit fees wait until the full loop works.

## Demo acceptance

- Aino, ebike-003, 36 months, no down payment, signed Nov5: monthly net10730 cents; November and December gross13466; January2027 gross13520.
- Scheduled rent net total386280 cents; buyout and down payment shown separately. Future gross totals depend on tax assumptions.
- Jan31 start restores the31st after short months; February2028 uses29th.
- Retry invoice issuance without creating duplicates (requires persistence increment).
- Return/refurbish/reoffer the same asset; new lease uses a different contract ID.
- No unsupported operation pretends to succeed; show clear errors and record known gaps.
