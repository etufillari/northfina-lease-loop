---
id: architecture
type: system-design
status: draft
title: Lease Loop Architecture and Spec
---

# Lease Loop: architecture and spec

**Status:** draft for team review (5 Nov 2026). Built from [architecture-notes.md](architecture-notes.md), [CHALLENGE.md](../CHALLENGE.md), [RULES.md](../RULES.md), [data/DATA.md](../data/DATA.md) and the starter code. The module specs in `src/*/SPEC.md` point here as their `parent`.

Items marked **[Decision]** were not settled in the notes and are proposed here. Agree or change them in review before the plan is written.

---

## 1. Goal and scope

Win the hackathon. That means a Spine that works end to end (all 7 steps, one item around the full loop), real depth on the chosen Smart Problems, and a live 4-minute demo. Deadline: **Fri 6 Nov 2026, 16:00 Helsinki**.

| In scope              | Smart Problem                                       |
| --------------------- | --------------------------------------------------- |
| Spine steps 1–7       | required                                            |
| Fair early exit       | #2                                                  |
| Smart question flow   | #4                                                  |
| Money that adds up    | #5                                                  |
| Circular impact (CO₂) | #7, **optional**. Nothing in the core depends on it |

**Out of scope for phase 1:** admin/back-office view (review queue, returned-items desk, audit viewer beyond a simple list), login, second-life matchmaking (#3), fleet contracts with more than one physical item.

**Scenario cards outside our Smart Problems must not crash** (cards 2, 3, 6, 9, 10). §11 says what each one shows.

## 2. Hard constraints (from RULES.md and the starter)

- No AI/ML/LLM in the product. Everything is rules, data and algorithms.
- Business logic in `src/domain/` as pure functions with co-located Vitest tests. No I/O, no `Date.now()`, `new Date()` or `Math.random()`. ESLint enforces this.
- Money is integer euro cents. Rates are integers (see §6). One rounding rule, written down.
- API routes use `handleRoute()`, `ok()`, `fail()`, `ApiError` and `readJsonBody()` from `src/server/api-response.ts`.
- Every data change goes through `withAudit(db, entry, (tx) => …)` from `src/server/audit.ts`, with every write on `tx`.
- Schema changes: edit `prisma/schema.prisma`, then `npm run db:migrate -- --name <what>`. Never hand-write SQL.
- UI strings in `src/i18n/messages/{en,fi,sv,et}.json`, same keys in all four.
- Source files under 600 lines. Conventional commits. Hooks on. `npm run check:all` green, with at least 60 % coverage on domain, server, data and i18n.

**Stack (verified):** Next.js 16 App Router (read `node_modules/next/dist/docs/` before writing routes), React 19, Prisma 7 on **SQLite** (`@prisma/adapter-better-sqlite3`), Zod 4, Vitest 5, Tailwind 4.

## 3. Team split

| Person | Role             | Owns                                                                                                                                                             |
| ------ | ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A      | Frontend         | All customer pages, sliders, question flow UI, contract/invoice views, early-exit and end-of-term screens, demo date control, translations                       |
| B      | Backend          | API routes, `question-flow/` + `application/` (#4), `contract/` (signing), `end-of-term/`, `second-life/` flow, integration tests                                |
| C      | Database + money | Schema, transactions, test DB helper and fixtures, `money/` (#5), `pricing/`, `early-exit/` (#2), buyout price, `second-life/` pricing, `impact/` (#7, optional) |

- **First ~30 minutes together:** write `src/domain/types.ts` and the API shapes in §8. Then A builds against mocked responses, B builds routes, C builds the money core, in parallel.
- If C falls behind, move `second-life/` pricing to B.

## 4. Architecture

### 4.1 Layers (each calls only the one below)

1. **UI** (`src/app/[locale]/`, `src/components/`): talks to the API for anything that saves data. It may import pure domain functions for **live previews only** (for example, the price sliders). The server always recomputes before it saves.
2. **API routes** (`src/app/api/`): validate input with Zod, load data, call domain functions, persist inside `withAudit()`, return the envelope. No business rules here.
3. **Domain** (`src/domain/`): pure functions. Time-dependent functions take an `asOf` (`YYYY-MM-DD`).
4. **Server/persistence** (`src/server/`, Prisma): repositories, audit, the `asOf` resolver.

### 4.2 Domain modules

Existing code is kept and built on. `contract-pricing.ts` already does the quote (worked example passes). It moves into `pricing/` and switches to the integer arithmetic in §6.1. Its tests must keep passing.

| Module                                                                       | Owner                  | Covers        | Status                                                             |
| ---------------------------------------------------------------------------- | ---------------------- | ------------- | ------------------------------------------------------------------ |
| `money/` (rounding, rates, calendar, schedule generator, allocation)         | C                      | #5 foundation | new                                                                |
| `pricing/` (quote from list price + term + down payment, VAT lookup, buyout) | C                      | Spine         | exists as `contract-pricing.ts`, `coefficient.ts`, `price-list.ts` |
| `question-flow/` (visible questions, pruning, validation, Y-tunnus)          | B                      | #4            | new                                                                |
| `application/` (eligibility decision with reasons)                           | B                      | #4 + Spine    | new                                                                |
| `contract/` (snapshot at signing + generated schedule)                       | B, using C's generator | Spine         | new                                                                |
| `early-exit/` (balance, exit quotes with breakdown)                          | C                      | #2            | new                                                                |
| `end-of-term/` (return / buy out / extend)                                   | B, buyout from C       | Spine         | new                                                                |
| `second-life/` (market value, refurbish decision, relist price)              | C pricing, B flow      | Spine         | new                                                                |
| `lifecycle/` (allowed status transitions)                                    | B                      | safeguards    | new                                                                |
| `impact/` (CO₂)                                                              | C                      | optional #7   | new                                                                |

Each module is a folder with an `index.ts` and files under 600 lines, every function tested next to it.

### 4.3 Storage approach: snapshot + stored schedule

At signing, the contract stores a frozen **snapshot**: price list version, list price, down payment, financed amount, band, factor, interest rate, term, start date, monthly net rent, buyout. A pure function generates the **whole invoice schedule once**. The rows are saved and **never edited**. `asOf` only decides whether a row is upcoming, due or past. That is computed on read, not stored. Early exit and buyout read the stored rows. The item lifecycle is an **append-only event history** on the asset (the passport).

Rejected: computing everything on the fly (old invoices would change when the logic changes), and full event sourcing (too much machinery for the deadline).

## 5. Data flow (the Spine)

| #   | Step         | Route                                                                                    | Domain                         | Saves                                                                 |
| --- | ------------ | ---------------------------------------------------------------------------------------- | ------------------------------ | --------------------------------------------------------------------- |
| 1   | Catalogue    | page + `GET /api/assets`                                                                 | `pricing.listPriceFor`         | nothing                                                               |
| 2   | Price        | `GET /api/quote?assetId&termMonths&downPaymentCents&asOf`                                | `pricing.quote`                | nothing (quote only)                                                  |
| 3   | Application  | `POST /api/applications`, `PUT /api/applications/:id/answers/:questionId`                | `question-flow`, `application` | application + answers                                                 |
| 4   | Contract     | `POST /api/contracts`                                                                    | `contract.buildContract`       | contract, invoice rows, asset → `leased`, event                       |
| 5   | Invoices     | `GET /api/contracts/:id?asOf`                                                            | `money.rowStatus`              | nothing                                                               |
| 6a  | Early exit   | `GET /api/contracts/:id/exit-quote?asOf&condition&usage`, `POST /api/contracts/:id/exit` | `early-exit`                   | closing row, contract → `exited`, asset → `returned` or `sold`        |
| 6b  | End of term  | `GET /api/contracts/:id/end-of-term?asOf`, `POST /api/contracts/:id/end-of-term`         | `end-of-term`                  | buyout row or return, contract → `ended`, asset → `returned` / `sold` |
| 7   | Second life  | `GET /api/assets/:id/relist-quote?asOf&condition&usage`, `POST /api/assets/:id/relist`   | `second-life`                  | refurbishment + relist price, asset → `available`                     |
| 7b  | Second lease | steps 1–5 again on the same asset                                                        | same                           | passport shows every life                                             |

**Price lock [Decision].** The application stores the quote it was made with (price list version and amounts). At signing, the server prices the asset again **on the signing date**. If the result is different (scenario card 2: v1 on 5 Nov, v2 on 6 Nov), signing returns `PRICE_CHANGED` with both quotes. The UI shows the old and new price and the reason ("a new price list started on 6 Nov"), and the customer confirms the new price to sign. Once signed, the contract snapshot is locked. Later price lists are never read for that contract. _Alternative for review:_ honour a quote for N days. That's friendlier to customers but needs a quote-expiry rule.

**Reserved and out-of-range items.** `ebike-009` is `reserved`. The catalogue shows it as not available, and quotes and applications return `ASSET_NOT_AVAILABLE`. `ebike-010` (€289, below €300) and `farm-006` (€260,000, above €250,000) return `BELOW_MINIMUM` / `ABOVE_MAXIMUM`. `farm-006` becomes leasable with a down payment of at least €10,000, and the UI says so.

## 6. Money core (#5)

### 6.1 Integers and one rounding rule

- **Cents:** every amount is an integer number of cents. A non-integer reaching a domain function is a bug and throws `RangeError`. That is already the pattern in `coefficient.ts`.
- **Rates as integers, converted once at the data edge:**
  - VAT and interest in **basis points**: 25.5 % → `2550`, 7.9 % → `790`.
  - Coefficient factors in **parts per million**: `0.027584` → `27584`.
  - Buyout percentage as a whole percent: `15`.
- **One rounding helper:** `mulDivRound(a, num, den)` computes `a × num / den` in integer arithmetic and rounds **half up** (amounts are never negative). Every derived amount calls it **once**:
  - monthly net rent = `mulDivRound(financed, factorPpm, 1_000_000)`
  - VAT on a row = `mulDivRound(net, vatBp, 10_000)`
  - buyout = `mulDivRound(financed, buyoutPercent, 100)`

  This matches the worked example exactly (10730 / 2736 / 13466 / 58350) and avoids float error near `.5`. Products stay below 2⁵³ (max 25,000,000 × 60,000).

- **Allocation:** `allocate(total, n)` splits a total into `n` integer parts that differ by at most 1 cent. The leftover cents go to the earliest rows, and the parts always sum to the total. It's used for multi-unit amounts and for any total the business wants split, not for ordinary rent (see §6.3).

### 6.2 Calendar

- Domain dates are `YYYY-MM-DD` strings, never JS `Date`. Helpers: `isValidIsoDate`, `addMonthsClamped`, `daysInMonth`, `isLeapYear`, `compareIso`, `monthsBetween`.
- **The billing day is anchored to the start day and clamped to the month length.** Invoice _k_ (0-based) is dated `addMonthsClamped(start, k)`, always counted from the start date and never chained, so the date doesn't drift: 31 Jan → 28 Feb (or 29 Feb) → 31 Mar → 30 Apr.
- **Rent is billed in advance.** Invoice _k_ covers `[date_k, date_{k+1} − 1 day]`, and the **due date is the invoice date** **[Decision]**. Payment terms are not modelled.
- **A mid-month start is not a partial month.** Periods run from the start day, so every period is one full month and nothing is prorated. That answers the challenge's "is the first month a full month?": yes, by construction.

### 6.3 Schedule generation

`generateSchedule(snapshot, vatRates) → InvoiceRow[]`:

- Optional row 0, `down_payment`, dated on the start date, if down payment > 0.
- `term` rows of kind `rent`, each with `net = monthlyNetRent`. Every rent row is identical net. That is what "locked price" means.
- Every row stores its **own** `vatRateBp` (the rate on **its invoice date**) and `vatCents = mulDivRound(net, vatRateBp, 10_000)`, and `gross = net + vat`. A VAT change mid-contract shows up only in later rows' VAT, never in net. This handles card 3 and Smart Problem #1 at no extra cost.
- **What "adds up" means:**
  - contract net rent total = `monthlyNetRent × term`
  - contract gross total = **sum of row gross**
  - Both are stored on the contract and must equal the sum of the rows. The existing `totalRentGrossCents` (one VAT rate × term) is replaced by the row sum, because the VAT rate can change during the term.
- `rowStatus(row, asOf)`: `upcoming` if after `asOf`, `due` if `asOf` falls inside its period, `past` otherwise. This is derived, not stored. There is no payments model. "Past" means billed.

**Card 1 reference numbers (ebike-003, 36 months, start 5 Nov 2026):** rent 10730 net. Invoices on 5 Nov and 5 Dec 2026 are 10730 + 2736 = **13466**. 5 Jan 2027 is 10730 + 2790 = **13520** (26 %). Net total 386280, gross total **486612**. Buyout 58350 net.

### 6.4 Property tests (fast-check, thousands of random contracts)

Add `fast-check` as a dev dependency. It is not AI, and `check:no-ai` allows it.

- Schedule net sum = `monthly × term (+ down payment)`. Gross sum = stored contract gross total, to the cent.
- No negative amounts. Every row date is a valid ISO date. Dates are strictly increasing. Each row's day equals `min(startDay, daysInMonth)`.
- `allocate` parts sum to the total and differ by at most 1 cent.
- Early-buyout quote never increases as `asOf` moves forward (§7).
- Early-buyout quote on the last day = end-of-term buyout price.
- Every quote breakdown sums to its total.
- Return-exit cost is between 0 and the nominal remaining rents.

## 7. Fair early exit (#2)

There is no official formula in the data, so this is our design. It is built so the lessor recovers what it is owed **financially**, the customer never pays interest for months they don't use, and **it equals the normal buyout at the end of the term**.

**Outstanding balance.** At exit date `asOf`, rows dated on or before `asOf` are billed and owed as normal. The remaining rows, _m_ of them, are discounted at the band's monthly rate `r = annual_interest_bp / 12 / 10_000`:

```text
balance(asOf) = Σ_{i=1..m} rent / (1 + r)^i  +  buyout / (1 + r)^m
```

- The coefficient factor is an annuity at the band rate with the buyout as a balloon. For ebike-003 the annuity gives 10722 against the table's 10730. So `balance` is the true remaining financed amount. At signing it is ≈ the financed amount: 388992 vs 389000. That is a good sanity check to show in the demo.
- When `m = 0` (term over), `balance = buyout`. **Consistency with the end-of-term buyout holds by construction.**
- The present value is computed in double precision and rounded **once** with `Math.round` at the end. This is the only non-integer step in the money core. It is documented and tested.

**The customer chooses one of two exit options:**

1. **Early buyout, keep the item:** pay `balance`. The asset becomes `sold`.
2. **Early return:** pay `max(0, min(balance − returnCredit, nominalRemainingRents))`, where `returnCredit = marketValue(item at asOf, condition, usage) − refurbishmentCost(item)`. Market value and refurbishment cost come from `second-life/` (§9), so the item's value at exit and its relist price use one formula. The asset becomes `returned`.

The quote takes `condition` and `usage` as inputs. The customer declares them, and the screen says "final amount confirmed after inspection". Default: `good`, current usage.

**Card 8 (Aino, ebike-003, exit after the 7th invoice, good condition, 0 km):** 29 rows remain.

- Balance ≈ 330666.
- Market value = 389000 × 80 % (age 7 months, interpolated from 82 % at 6 and 70 % at 12) × 0.85 (good) = 264520.
- Credit = 264520 − 4500 (safety inspection) = 260020.
- **Early-return cost ≈ €706.46 net + VAT.** For comparison, the nominal remaining rents plus buyout are €3,695.20.

The UI shows every line. The domain fixes the exact figures; tests pin them.

**Breakdown.** Every quote returns `lines: { key, amountCents, params }[]`, for example remaining rents nominal, interest not charged, buyout discounted, return credit, refurbishment. The total is computed **as the sum of the rounded lines**, so they always add up. The UI translates `key` with `params`. Both exit quotes are shown side by side with the "finish the contract" option.

**The closing invoice** is a row of kind `exit_return` or `exit_buyout`, dated `asOf`, with VAT at that date's rate. Unbilled rent rows stay stored but are marked `cancelled_by_exit` (the only status ever set on a row after creation; amounts never change).

**Config [Decision]:** no extra exit fee, and the return credit is 100 % of the net market value. Both live in `config` (§10) so the judges' surprise scenarios can turn them.

## 8. Question flow and eligibility (#4)

### 8.1 Engine

- **Input context:** `{ customerType, category, financedAmountCents, termMonths, answers }`. Customer type is itself the answer to `q_customer_type`. Asset and amount come from the quote saved on the application.
- `visibleQuestions(questions, ctx)` evaluates `ask_when` (all conditions must hold; ops `in`, `gte`, `lte`; field `answers.<id>`). It runs **to a fixed point**: a hidden question's answer doesn't count, so chains like `q_can_sign → q_signatory_email` and `q_pep → q_pep_details` resolve correctly.
- `nextQuestion(…)` is the first visible, unanswered question in file order, or `done`.
- **Changing an answer:** after any change, the server recomputes visibility. Answers to questions that are no longer visible are **kept but marked inactive**. They are not used in decisions and not shown. If the question becomes visible again, the old answer is offered back. Nothing the customer typed is silently lost, and nothing irrelevant is used. The UI says "we no longer need: …" when answers drop out.
- **Blocking answers:** `blocks_application_when` (`age_under 18`, `answer_in ['other']`) stops the flow **straight away** with a decline. A 17-year-old isn't asked for their income first.
- **Validation per type:** email, ISO date, money (non-negative integer cents, typed in euros and converted at the edge), choice in options, Finnish business ID check digit (weights 7,9,10,5,8,4,2; remainder 0 → 0; 1 → invalid; else 11 − remainder). `1234567-8` fails. Every other ID in `customers.json` passes.
- **Why we ask:** every question shows its `why_we_ask` in the current locale, straight from `questions.json`.

### 8.2 Decision

`decide(ctx, asOf) → { outcome: 'approved' | 'declined' | 'manual_review', reasons: ReasonCode[] }`. Reason codes are rule IDs from the data (`min_age`, `residency`, `affordability`, `business_id`, `pep_manual_review`, `financed_limits`) plus `signatory_required`.

Precedence: any decline beats manual review, and manual review beats approved. All reasons are returned, not just the first.

- **Age** is checked on the contract start date (= the signing date). It is checked again at signing.
- **Affordability [Decision]:** gross rent ≤ 30 % of net monthly income, using the **highest VAT rate in force during the term**, so a known VAT rise can't push an approved customer over the limit. It applies only when income was asked (financed ≥ €2,000, consumer).
- **Signatory (card 6):** `q_can_sign = no` gives outcome `approved` with a `signatory_required` notice. The contract is created as `awaiting_signature`. The signatory gets a signing link (random token; in the demo it is shown on screen instead of emailed). Only that link can sign. **[Decision]**, the alternative being manual review.
- Responses never echo income, birth date or address. They return reason codes only.

## 9. End of term and second life

**End of term** (`asOf` on or after the last row's period end):

- **Buy out:** buyout row (net from the snapshot + VAT on that date). The contract becomes `ended` and the asset `sold`.
- **Return / pass it on:** no charge. The contract becomes `ended` and the asset `returned`, which hands it to second life.
- **Extend [Decision, stretch]:** a new contract on the same asset with financed amount = buyout, priced by the normal coefficient table. Offered only if the buyout fits a band.

**Second life (Spine minimum, not #3):**

- `marketValue(firstListPrice, ageMonths, condition, usage)` = first list price × curve(age), with linear interpolation and the last value held after the final point, × condition multiplier × usage adjustment (steps of `step`, capped at `max_total_percent`). Rounded once.
- `refurbishmentPlan(item)`: mandatory fixed costs (conditions parsed from the data's `when` strings into a small typed rule table, one entry per string, tested), plus the condition upgrade to `good` when the condition is below good. Battery replacement resets usage. **Refurbish iff** `value_after − cost > value_as_is`. Otherwise relist as is, if the condition is at least `good`.
- **Relist price** = market value after refurbishment. It is stored on the asset and used **instead of the price list** for that asset's next quote. After that the normal coefficient pricing applies.
- **Age and first list price [Decision]:** taken from the asset's first lease in its passport. Seeded items that already have `previous_lives > 0` get a documented assumption: first lease on 1 January of `model_year`, at the earliest list price in the data.
- **Card 9 (ebike-007, fair, 18,400 km):** refurbish to good + battery + safety inspection = 51500. Relist ≈ €1,516. Monthly rent fits both `wait-02` and `wait-13`. Who gets it is #3 and out of scope. If time allows: filter by category, minimum condition and budget, then earliest `needed_by`, then earliest signup (ID order).

**Passport:** `AssetEvent` rows (§10.1), shown on the asset page as a timeline of lives. Card 10 (`ebike-008`, 2 lives) shows two seeded summary lives + the new lease. CO₂ (#7) is optional and goes only here.

## 10. Persistence, config and lifecycle

### 10.1 New Prisma models (C)

```text
Application  id (uuid), asset_id, created_on (asOf), quote_json (snapshot),
             answers_json, inactive_answers_json, outcome?, reasons_json?, status
Contract     id (uuid), application_id @unique, asset_id, status,
             start_date, price_list_version, list_price_cents, down_payment_cents,
             financed_cents, band, factor_ppm, annual_interest_bp, term_months,
             monthly_net_rent_cents, buyout_net_cents, total_net_cents, total_gross_cents,
             signatory_token? (unique), signed_on?, closed_on?
InvoiceRow   id, contract_id, seq, kind (down_payment|rent|exit_return|exit_buyout|buyout),
             invoice_date, period_start, period_end, net_cents, vat_rate_bp, vat_cents,
             gross_cents, cancelled_by_exit (bool)    @@unique([contract_id, seq])
AssetEvent   id, asset_id, on_date, from_status, to_status, contract_id?, condition?,
             usage_value?, amount_cents?, note_key?    (append-only)
Asset        + relist_price_cents?, first_lease_date?, first_list_price_cents?
```

- Asset statuses are extended: `available | reserved | leased | returned | sold`.
- The database stores the **customer's answers only as needed for the decision**. Data from `customers.json` is never copied in.

### 10.2 Lifecycle guards

One table in `domain/lifecycle`:

- **Asset:** `available → leased`, `leased → returned | sold`, `returned → available` (relist), `reserved` is fixed.
- **Contract:** `awaiting_signature → active`, `active → exited | ended`.
- **Application:** `in_progress → decided → signed`.

Every route checks the table. Sign, exit, end-of-term and relist each run inside one `withAudit()` transaction that **re-reads and re-checks status** on `tx`, so double-clicks can't create two contracts or two exit invoices.

### 10.3 Config

`src/domain/config.ts` holds tunable numbers: affordability 30 %, minimum age 18, exit fee 0, return credit 100 %, minimum relist condition `good`, down payment slider step €50. Plain constants, passed into functions as arguments so tests can vary them. Rates, bands and thresholds keep coming from the data files.

## 11. API conventions

- **`asOf`:** every request may send `asOf` (query string for GET, body field for POST). `resolveAsOf(request)` in `src/server/` validates it as a real calendar date and falls back to `todayIso()`. The demo date picker in the header sets it for every request. **[Decision]** It is allowed in all environments for the hackathon; production would disable it.
- **Validation:** Zod at the edge for types, ranges, UUIDs and terms in the table. Out-of-range values are **rejected, not clamped**. The UI slider clamps; the API does not.
- **Errors:** domain functions return `{ ok: false, code, reasons? }`. Routes map them to `fail(status, CODE, message)`: 404 for unknown IDs, 409 for state conflicts (`CONTRACT_NOT_ACTIVE`, `ASSET_NOT_AVAILABLE`, `PRICE_CHANGED`), 422 for business rejections. The UI translates the **code** (`errors.<CODE>` keys), never the message. Unexpected errors go through `handleRoute` as a generic 500.
- **Audit actions:** `application.created`, `application.answered`, `application.decided`, `contract.signed`, `contract.exited`, `contract.ended`, `asset.relisted`, `asset.status_changed`. Details record what changed, never personal data.
- **Privacy:** random UUIDs, no list endpoints for applications, contracts or customers, minimal response bodies, nothing personal in URLs or logs.
- **Dev only:** a "Fill sample data" button (`NODE_ENV !== 'production'`) fills answers from `customers.json`.

## 12. Scenario card acceptance

| Card               | Expected result in our app                                                                                                                                                                                                 |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 Happy path       | Rent 10730 net / 13466 gross. Invoices on 5 Nov, 5 Dec, 5 Jan (the 3rd at 26 %: 13520). Total 486612 gross                                                                                                                 |
| 2 Price lock       | Sign on 6 Nov → `PRICE_CHANGED`, shows v1 349000 vs v2 321100 and why. The contract locks v2 after confirmation                                                                                                            |
| 3 Tax is not price | ebike-001: net 6957 every month. Dec 2026 VAT 1774 (25.5 %), Jan 2027 VAT 1809 (26 %). The UI explains "rent locked, VAT follows the law on the invoice date"                                                              |
| 4 Calendar traps   | laptop-001 from 31 Jan 2026: invoices on **28 Feb 2026** and **29 Feb 2028**, rent 3432                                                                                                                                    |
| 5 Too young        | Flow stops after the birth date. Declined, reason `min_age`, kind message with alternatives                                                                                                                                |
| 6 Who can sign?    | 4 × 549000 = 2,196,000 financed (band C) → PEP question shown. `q_can_sign = no` → signatory email → `awaiting_signature` with a signing link. Quantity affects pricing and questions only (fleet signing is out of scope) |
| 7 Big ticket       | financed 12,500,000 (band D): annual revenue, beneficial owners, PEP and PEP details all appear, each with its "why". PEP yes → `manual_review` (`pep_manual_review`)                                                      |
| 8 Early exit       | §7 numbers, both options with a breakdown                                                                                                                                                                                  |
| 9 Second life      | §9: refurbish, relist price, matching only if time allows                                                                                                                                                                  |
| 10 Third life      | Passport shows 2 earlier lives + the new lease. CO₂ only if #7 is built                                                                                                                                                    |

These become the full-loop integration test and the demo script.

## 13. Testing

- **Unit tests** (each module's owner): every domain function, edge cases first (band limits 199999 / 200000, 29999 / 30000, 25,000,000 / 25,000,001, 31 Jan, 29 Feb, last day of the term, VAT switch day).
- **Property tests:** §6.4.
- **Integration tests** (B writes them, C provides the helper): each route against a **separate SQLite test file**, migrated fresh and seeded from the data pack, wiped between files. They check the envelope, the stored rows and the matching `AuditLog` rows. They never touch the dev database.
- **Full-loop test** (written last, together): one item through steps 1–7 and into a second lease.
- **CI:** the existing workflow (`check:all`). SQLite needs no database service.

## 14. Order of work

1. Together: `types.ts`, API shapes (§11), Prisma models (§10.1) agreed.
2. C: `money/` (rounding, calendar, schedule, properties) → `pricing/` refactor → migration + test DB helper → `early-exit/` → `second-life/` pricing.
3. B: `question-flow/` + `application/` → application routes → `POST /api/contracts` → invoices route → exit and end-of-term routes.
4. A: demo date picker → catalogue + sliders (exists) → question flow UI → contract and invoices views → exit / end-of-term → passport.
5. Full-loop test, demo rehearsal against §12.
6. Stretch, in order: matchmaking tie-break, extend, CO₂, admin view.

## 15. Open questions for review

1. Price lock: re-confirm on change (proposed), or honour quotes for N days?
2. Signatory: `awaiting_signature` + link (proposed), or manual review?
3. Early return credit: 100 % of net market value, or a remarketing haircut?
4. Affordability on the highest VAT rate during the term (proposed), or the first invoice's rate?
5. Due date = invoice date (proposed), or invoice date + 14 days?
