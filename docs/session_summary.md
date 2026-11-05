# Session Summary & Project Tracking

**Date**: 2026-11-05  
**Hackathon**: Lease Loop · Northfina × Hive Helsinki  
**Branch**: `feat/lease-application`  
**Latest Commits**:

- `7ba0013`: `docs(eval): add evaluation of initial brainstorm notes`
- `e16715e`: `feat(application): add initial lease application page and endpoint`
- `149898a`: `feat(question-flow): add question targeting, validation, and eligibility engine`

---

## 1. Objectives & Progress in this Session

### Phase 1: Review & Strategic Alignment

- Evaluated the initial brainstorm (`docs/johnny_initial_notes.md`) against `CHALLENGE.md`, `RULES.md`, and `data/DATA.md`.
- Formally documented gaps in `docs/evaluation_of_initial_notes.md`:
  - Discarded complex user authentication/login in favor of the 10 pre-configured customer personas in `data/customers.json` (essential for 4-minute judge pitches).
  - Clarified that "Pass it on" feeds into Step 7 (Second Life refurbishment, re-pricing, and matchmaking).
  - Highlighted that Smart Problems represent 50% of the Product score (20/40 pts).

### Phase 2: Lease Application Subpage & API

- Created the subpage route: `src/app/[locale]/apply/page.tsx`.
- Built the interactive client component: `src/components/application-form.tsx`.
- Integrated full 4-language i18n (`en`, `fi`, `sv`, `et`) in `src/i18n/messages/` with navigation links.
- Created `src/app/api/applications/route.ts` and service layer `src/server/applications.ts`.
- Enforced Northfina's engineering rules by ensuring every application submission is transactionally recorded in `AuditLog` via `withAudit()`.

### Phase 3: Pure Domain Question-Flow Engine (Smart Problem 4)

- Implemented pure business rules in `src/domain/question-flow.ts` (zero side-effects, no framework imports, no `new Date()`, money in cents):
  - **Dynamic `ask_when` targeting**: Evaluates field visibility based on customer type, asset category, financed amount, and previous answers.
  - **Finnish Business ID (Y-tunnus) Checksum**: Implemented official modulo-11 check digit algorithm (weights 7, 9, 10, 5, 8, 4, 2).
  - **Age Calculation**: Pure integer date math to determine exact age relative to contract date.
  - **Pruning & State Resilience**: Resolved UX draft state vs. eligibility evaluation. Stale answers lingering in form state for invisible questions do not cause false rejections.
  - **Dynamic Band Limits**: Derived minimum (€300) and maximum (€250,000) financed limits directly from `coefficient-table.json`.
  - **Eligibility Evaluation**: Determines `approved`, `rejected` (with reasons), or `manual_review` (PEP / signatory authorization).

---

## 2. Scenario Cards Covered & Tested

The test suite in `src/domain/question-flow.test.ts` runs directly against the real data pack (`data/questions.json`, `data/customers.json`, `data/coefficient-table.json`):

| Scenario Card / Edge Case    | Persona                           | Expected Outcome                                           | Verification Status |
| :--------------------------- | :-------------------------------- | :--------------------------------------------------------- | :------------------ |
| **Card 1: Happy Path**       | Aino (`cust-aino`)                | Approved (29yo, employed, €3200 income, commute e-bike)    | Verified ✅         |
| **Card 5: Too Young**        | Mikko (`cust-mikko`)              | Rejected kindly with `min_age` explanation (17yo)          | Verified ✅         |
| **Card 6: Who Can Sign?**    | Norvi Logistics (`cust-norvi`)    | Manual review: `signatory_authorization`                   | Verified ✅         |
| **Card 7: Big Ticket & PEP** | Haapalan Tila (`cust-haapala`)    | Manual review: `pep_manual_review` on €145k tractor        | Verified ✅         |
| **Trap: Invalid Y-tunnus**   | Typo Trading (`cust-broken-id`)   | Rejected: `business_id` check digit mismatch (`1234567-8`) | Verified ✅         |
| **Affordability Limit**      | Sanna (`cust-sanna`)              | Rejected: `affordability` (rent > 30% of €900 income)      | Verified ✅         |
| **State Resilience**         | Switched from company to consumer | Approved: invisible company fields ignored in evaluation   | Verified ✅         |
| **Coefficient Limits**       | Out of band                       | Rejected: `financed_limits` for < €300 or > €250,000       | Verified ✅         |

---

## 3. Engineering & Test Metrics

- **Total Test Suites**: 16 passing (142 tests).
- **Line Coverage**:
  - `src/domain/question-flow.ts`: **91.8%**
  - Entire repo (domain, server, data, i18n): **94.7%** (Coverage gate requirement is $\ge 60\%$).
- **File Sizes**: All files strictly under 600 lines (enforced by `scripts/check-file-size.mjs`).
- **No-AI In Product**: Verified by `scripts/check-no-ai.mjs`.
- **CI Suite**: `npm run check:all` passes 100% green.

---

## 4. Next Recommended Steps

1. **Wire Question Flow into `ApplicationForm`**:
   - Filter rendered questions dynamically using `isQuestionVisible()`.
   - Add inline field validation feedback (e.g. Y-tunnus checksum error).
   - Display real-time eligibility status box (Approved / Manual Review / Rejected).
   - Add top-bar **Persona Selector** to auto-fill judge scenarios in 1 click.
2. **Pricing Engine & Asset Configurator (Spine Step 2 & Smart Problem 6)**:
   - Implement `src/domain/pricing.ts` with term & down payment sliders.
   - Link Catalogue cards directly to the configured application.
3. **Database Models & Invoicing (Spine Steps 4 & 5 + Smart Problem 1)**:
   - Add `Contract` and `Invoice` to `prisma/schema.prisma`.
   - Implement VAT shift on 1 Jan 2027 (25.5% $\rightarrow$ 26.0%) while keeping net rent locked.
