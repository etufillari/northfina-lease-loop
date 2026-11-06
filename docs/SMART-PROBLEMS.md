# Our five smart problems

Target: challenge problems **1–5**. These features use rules and data, with no AI inside the product. This document explains the implementation and its limits.

## 1. Lock the price, not the tax

**Problem:** customers expect a signed price to stay fixed, but tax can change later.

**Solution:** save the quote’s price-list version and the signed net rent. New catalogue prices cannot overwrite them. Each invoice selects VAT by its invoice date and saves that tax snapshot permanently. The invoice forecast highlights the transition, showing the old/new gross amounts beside the unchanged net rent. The customer lease also names the saved price-list version.

**Demo:** open My leases → Full invoice forecast. Compare December 2026 and January 2027. Challenge VAT changes from 25.5% to 26%; it is fictional, not real tax guidance. Card 2 also verifies that a saved v1 quote signed when v2 is live retains v1 through the offer’s expiry.

**Code:** `src/domain/lease-engine/invoice.ts`, `src/server/lease-engine/invoices.ts`, `src/components/invoice-forecast.tsx`.

## 2. Fair early exit

**Problem:** a customer leaving early needs an understandable charge that does not exceed the agreed buyout cap.

**Solution:** our signed V1 policy charges the smaller of remaining net rents and the signed end-of-term buyout, with no administration fee. The customer chooses completed months, previews the calculation and dated VAT, then explicitly confirms. The preview does not terminate the lease. Confirmation recalculates on the server, records the obligation and stops future rent. The physical item must still be returned.

**Card 8 example:** Aino’s 36-month lease at €107.30 net per month, exit after 6 completed months: 30 × €107.30 = €3,219.00 remaining rent. Signed buyout cap €583.50, so the fee is €583.50 net. At the fictional 26% VAT the total is €735.21, effective 5 May 2027.

**Demo:** active lease → Early return → Calculate without ending the lease → inspect calculation → Confirm fee and end this lease. Confirming is a real persisted demo state change.

**Trade-off:** this is a deliberately simple agreed cap, not a market-value settlement. Future issued invoices require credit handling first; the app blocks that case. Legacy contracts without the agreed policy cannot use it. No payment is fabricated.

**Code:** `src/domain/circular/exit.ts`, `exit-quote.ts`, `src/server/circular/end-options.ts`, `src/components/early-exit-preview.tsx`.

## 3. Second-life matchmaking

**Problem:** a returned item needs safe repairs, a defensible used price and a customer who can actually use and afford it.

**Solution:** inspection creates a required work plan from condition and wear. A preview applies the same valuation rules as actual completion: age curve × condition × bounded usage adjustment, using exact cent arithmetic. The company sees estimated as-is value, restored value, costs and value uplift minus work costs before doing the work. Positive incremental value plus feasible demand gives a refurbishment recommendation; weak economics or no demand are flagged for review.

Candidates must satisfy category, minimum condition, rent budget, supported term and deadline. Earliest deadline ranks first; equal deadlines use the stable request ID. The UI names the first candidate and explains the ordering. The passport retains the physical asset’s identity and actual history.

**Card 9:** inspect imported `ebike-007` at fair condition / 18,400 km. The upgrade, battery and safety work costs €515.00. Inspect the proposed rent and ranking: `wait-02` is ahead of `wait-13` under the deadline rule.

**Approval gate:** all required tasks must be confirmed. Completed work stays pending and unavailable. Company approval publishes the dated offer; a second customer then signs a separate agreement for the same asset.

**Trade-offs:** the recommendation is advisory, not a global profit optimizer or saved customer assignment. Funding, logistics and overhead are excluded. A preview assumes availability at the recorded return date; later completion can change value and demand. Safety work cannot be skipped. Model-year January 1 is the documented age proxy because manufacture dates are absent.

**Code:** `src/domain/circular/{refurbishment,valuation,recommendation}.ts`, `src/server/circular/{queries,service}.ts`.

## 4. The smart question flow

**Problem:** asking every customer every question is confusing, and changing an answer can invalidate earlier answers.

**Solution:** question applicability uses customer type, asset category, financed amount, term and earlier answers. Every visible question includes the data pack’s localized “why we ask”. Editing an answer prunes irrelevant answers to a fixed point; the server also validates/prunes submitted answers. Eligibility produces approval, rejection or manual review with customer-readable reasons in all four languages. Submitted answers cannot grant company signing authority or remove a known PEP flag.

**Demo:** change customer-type or amount-related answers and show the questions adapting. Card 5 rejects a minor kindly; card 6 requires authorized signing; card 7 asks the relevant high-ticket/company questions and routes PEP to manual review.

**Limit:** card 6’s authorization guard works; a real four-asset fleet contract is not implemented. Manual review is a decision state, not a complete staff underwriting workflow.

**Code:** `src/domain/question-flow.ts`, `application-answers.ts`, `application.ts`, `src/i18n/decision-reason.ts`, `src/components/lease-application.tsx`.

## 5. Money that adds up

**Problem:** cent rounding and short months can make bills inconsistent with the signed agreement.

**Solution:** amounts are integer euro cents; decimal factors become exact rational calculations. VAT uses explicit positive half-up rounding once per invoice line. Every monthly period uses the original start-day anchor, clamped to short-month end; March restores January’s original day. The first period is a full anniversary month, not a partial calendar month. Due dates add the agreed calendar-day payment period. Forecast totals show net, VAT and gross separately, and future rent is excluded after early termination.

**Card 4:** a 31 January 2026 start bills on 28 February 2026 and 29 February 2028. With 14-day payment terms, both due dates are 14 March. Card 1 verifies first invoices and schedule totals.

**Evidence:** focused edge-case tests plus 2,880 deterministic generated schedule cases. These are generated tests, not a claim that a property-testing library is installed. Issued invoices are persisted separately from projections and retain their original tax snapshots.

**Code:** `src/domain/circular/money.ts`, `src/domain/lease-engine/{calendar,invoice}.ts`, `src/components/invoice-forecast.tsx`.

## Four-minute pitch

Demonstrate the full loop, then go deep on VAT and one decision: early exit or second-life matching. Explain that all five have tested implementations, but do not spend four minutes opening five unrelated screens. Keep the other scenarios ready for Q&A. See [PITCH-OUTLINE.md](PITCH-OUTLINE.md).

Problems 6 and 7 remain extras: price breakdown and fictional per-item impact exist, but side-by-side term comparison, complete fleet impact and a money-savings baseline are not headline claims.
