# Evaluation of Initial Notes (`johnny_initial_notes.md`)

This document evaluates the initial project brainstorm against the challenge specification (`CHALLENGE.md`), engineering rules (`RULES.md`), synthetic data pack (`data/DATA.md`), and the domain architecture (`src/domain/README.md`).

---

## 1. Misunderstandings & Inaccuracies

| Note in Johnny's Draft                                              | Actual Requirement / Data Pack Reality                                                                                  | Impact & Correction                                                                                                                                                                                                                                                                                                    |
| :------------------------------------------------------------------ | :---------------------------------------------------------------------------------------------------------------------- | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **"A series of yes/no questions"**                                  | Questions in `data/questions.json` are **typed**: `choice`, `text`, `date`, `number`, `boolean`.                        | The application is not a binary quiz. Fields include full name, birth date, country, monthly net income, business ID, beneficial owners, etc.                                                                                                                                                                          |
| **"All questions in one big list first? / All require an answer?"** | Questions are dynamically targeted via **`ask_when` rules**.                                                            | An empty `ask_when` means always ask; otherwise conditions depend on `customer_type`, `category`, `financed_amount_cents`, and earlier answers. Asking everything in one static list violates Smart Problem 4 and breaks UX for consumers vs. companies.                                                               |
| **"Pass it on -> user 1 marks as passed on, user 2 confirms?"**     | "Pass it on" is not a P2P informal handoff; it feeds into **Second Life** (Step 7).                                     | The lessor inspects the asset, applies condition/wear assessment, calculates refurbishment costs (`data/refurbishment-costs.json`), re-prices it, and matches it with the waiting list in `data/second-life-demand.json`.                                                                                              |
| **"Login functionality / User logins?"**                            | Real auth/passwords are **out of scope** and a hackathon time sink.                                                     | The data pack provides 10 pre-built personas in `data/customers.json` (`cust-aino`, `cust-mikko`, `cust-haapala`, etc.) tailored to judge scenario cards. Use a **Persona Switcher / Scenario Loader** dropdown instead of an auth system.                                                                             |
| **"What disqualifies someone and how should they be told?"**        | Eligibility criteria are already codified in `data/questions.json` (`eligibility_rules` and `blocks_application_when`). | Rules: Age ≥ 18, residency in FI/SE/EE, monthly rent ≤ 30% of net income (consumers), valid Finnish Y-tunnus checksum algorithm, PEP triggers **manual review** (not outright reject), financed amount within €300–€250,000, and company signer authorization. Scenario 5 explicitly instructs: _"Be kind and clear"_. |

---

## 2. Critical Requirements Missing or Unaddressed

1. **Smart Problems are 50% of the Product Score (20/40 pts)**:
   - The notes focus heavily on the 7-step Spine, but `CHALLENGE.md` explicitly states: _"The Spine is the entry ticket. It can't win on its own."_
   - The team **must pick at least 2 Smart Problems** to win. Recommended strong combinations:
     - **Problem 1 (Lock price, not tax)** + **Problem 4 (Smart question flow)** + **Problem 6 (Explain my price)**
     - Or **Problem 3 (Second-life matchmaking & item passport)** + **Problem 7 (Circular impact CO₂)**
2. **Scenario Cards Alignment**:
   - The judges will evaluate the live app against the 10 scenario cards in `CHALLENGE.md` (e.g., Aino's happy path, quote on Nov 5 vs sign on Nov 6 with price list v2, VAT rate change on 2027-01-01, leap-year invoices, Mikko age 17 rejection, Haapala Tila manual review). The UI and data flow must make demonstrating these trivial.
3. **Engineering Constraints from `RULES.md` (35% of total score)**:
   - **No AI inside the app**: `npm run check:no-ai` is run by CI. No LLM APIs or prompt-based decision-making.
   - **Pure domain logic in `src/domain/`**: Zero side-effects, no DB, no `new Date()`, no `Math.random()`. Minimum **60% test coverage gate** in CI.
   - **Money in integer cents**: Never floating-point euros.
   - **Audit trail**: Every state mutation (contracts, invoices, returns) must execute through `withAudit()` in `src/server/audit.ts` within the same Prisma transaction.
   - **i18n in 4 languages (`en`, `fi`, `sv`, `et`)**: All keys in `src/i18n/messages/` must stay synchronized.
   - **File length < 600 lines**.
4. **Time & Date Handling**:
   - Price list v2 activates on Fri 6 Nov 2026, and Finnish VAT changes on 1 Jan 2027. A simulated date/time-travel control (feeding into `src/server/today.ts`) is practically essential for live demoing.

---

## 3. Evaluation of the Proposed Page Breakdown

Johnny's proposed breakdown covers the spine steps, but grouping pricing into the front page and omitting second-life/back-office operations leaves major gaps.

### Recommended Page Architecture

```text
1. Catalogue & Filter (/[locale])
   └── 2. Asset Detail & Price Configurator (/[locale]/assets/[id])
        └── 3. Dynamic Application Flow (/[locale]/apply?assetId=...&term=...)
             └── 4. Contract Review & Price Lock (/[locale]/contracts/[id])
                  └── 5. Active Lease & Invoices Dashboard (/[locale]/contracts/[id])
                       ├── 6. End of Term Actions (Buyout / Early Exit / Return)
                       └── 7. Second Life & Fleet Operations (/[locale]/fleet or /dealer)
```

1. **Global Header (Crucial Demo Helper)**:
   - **Language Switcher** (`en`, `fi`, `sv`, `et`).
   - **Persona Quick-Select**: Pre-fill answers from `data/customers.json` for instant scenario testing.
   - **Time Machine / Simulated Date Picker**: Lets judges shift dates (e.g., Thu 5 Nov 2026 vs. Fri 6 Nov 2026 for price lists, or 1 Jan 2027 for the VAT change) via `src/server/today.ts`.
2. **Page 1: Catalogue (`/[locale]`)**:
   - Asset cards, category filters, condition badges, and today's list price (already scaffolded in `src/app/[locale]/page.tsx`).
3. **Page 2: Asset Configurator & Price Breakdown (`/[locale]/assets/[id]`)**:
   - Sliders for term (12/24/36/48 mo) and down payment.
   - Live net monthly rent, VAT calculation, and end-of-term buyout.
   - Fulfills **Smart Problem 6 (Explain my price)**: transparent side-by-side term comparisons.
4. **Page 3: Application & Eligibility Flow (`/[locale]/apply`)**:
   - Progressive dynamic questionnaire evaluating `ask_when` rules.
   - Explanatory tooltips (_"Why we ask"_).
   - Outcome screens:
     - **Approved**: proceeds to sign.
     - **Rejected**: polite explanation (e.g., under 18, outside FI/SE/EE).
     - **Manual Review**: explains triggering factors (e.g., PEP check, high-value asset > €100k).
5. **Page 4: Contract Signing & Lock (`/[locale]/contracts/[id]`)**:
   - Locks agreed net price while showing statutory VAT disclosure (addressing **Smart Problem 1**).
   - Sign button triggers a Prisma transaction logged via `withAudit()`.
6. **Page 5: Active Lease & Invoices (`/[locale]/contracts/[id]/invoices`)**:
   - Monthly invoice schedule with due dates (handling leap year/end-of-month calendar traps).
   - VAT rate transition visualization (25.5% in 2026 → 26% in 2027).
   - "Mark as paid" action + "Early exit buyout calculator" (addressing **Smart Problem 2**).
7. **Page 6: Second-Life Operations Hub (`/[locale]/dealer` or `/second-life`)**:
   - Required for Step 7 of the Spine and Scenario Cards 9 & 10.
   - Displays returned assets, wear & refurbishment checklists (`data/refurbishment-costs.json`).
   - Matchmaking algorithm connecting returned items to waiting buyers (`data/second-life-demand.json`).
   - **Asset Passport & CO₂ footprint tracking** (`data/co2-factors.json`).

---

## 4. Suggested Immediate Next Steps

1. Pick the **2 Smart Problems** to focus on.
2. Agree on the Prisma schema extensions needed for `Contract`, `Invoice`, and `SecondLifeMatch` in `prisma/schema.prisma`.
3. Start implementing pure domain functions in `src/domain/` with unit tests before wiring Next.js UI pages.
