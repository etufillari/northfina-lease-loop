# Lease Loop

Link to demo: [https://solving-poll-tiles-heating.trycloudflare.com/en]
password to dashboard: 344c4af88f18d734cd1fba914ded5b61

### One asset. Several customers. A traceable lease lifecycle.

Lease Loop is our Northfina × Hive Helsinki hackathon solution for circular leasing of **e-bikes, laptops and farm machines**. It connects customer finance, monthly billing and company return operations so a physical item can start its next lease without losing its history.

**Implemented:** the complete lease loop and smart problems **1–5**. **Verified:** 321 tests across 56 files, repository checks and a production build. The interactive hackathon demo runs in development mode; this is a prototype, not a production lending or payment system.

[Challenge](CHALLENGE.md) · [Five smart problems](docs/SMART-PROBLEMS.md) · [UI walkthrough](docs/UI-LIFECYCLE-WALKTHROUGH.md) · [Scenario results](docs/SCENARIO-CARD-RESULTS.md) · [Pitch](docs/PITCH-OUTLINE.md)

**Temporary live demo:** [Open Lease Loop](https://solving-poll-tiles-heating.trycloudflare.com/en). This preview depends on the team’s computer and tunnel staying online; use the local setup below if it is unavailable.

## The business problem

A leasing service must do more than calculate a monthly price. Customers need understandable terms and exit choices. The company needs accurate invoices, authorized decisions, confirmed physical returns and a defensible next-life price. Disconnected steps can double-allocate an item, change signed terms or offer it again before inspection.

Our solution keeps the agreement, running lease, invoices and physical asset linked. Customer actions and company operations have separate views. Every business write and its audit record commit together.

## The working loop

**Browse → quote → application → signed contract → active lease → invoices → end choice → return request → physical receipt → inspection → required repairs → company approval → used offer → next customer.**

| Customer view                                               | Company operations                                             |
| ----------------------------------------------------------- | -------------------------------------------------------------- |
| Browse assets and adjust term/down payment                  | See return-request notifications and the receipt queue         |
| Answer relevant questions and sign agreed terms             | Confirm physical receipt and record condition/usage            |
| View owned leases, invoice forecasts and saved invoice PDFs | Review mandatory work, costs and matching recommendations      |
| Preview early-exit costs or choose return/pass-on/buyout    | Approve an offer before the asset becomes available again      |
| Submit usage and request return; follow progress            | Generate invoices and inspect the asset passport/audit history |

The next agreement gets new contract/lease IDs while preserving the **same asset ID and serial number**. Original signed terms and issued invoices remain unchanged. A return request is not physical receipt; an invoice or settlement is not proof of payment.

## Five smart problems and our decisions

| Problem                        | How Lease Loop solves it                                                                                                                                               | What to demonstrate                                                                                              |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| **1. Lock price, not tax**     | Save quoted price-list version and signed net rent. Resolve VAT at invoice date and preserve each issued tax snapshot.                                                 | A saved v1 quote survives v2; December/January gross changes while net rent stays fixed.                         |
| **2. Fair early exit**         | Preview the smaller of remaining net rents and signed end buyout, then add dated VAT. Confirmation recalculates before persisting termination.                         | Month 7: remaining rent, cap, fee and date shown before confirmation. Future issued rent requires credits first. |
| **3. Second-life matchmaking** | Use condition, wear, mandatory repairs, residual curves and costs. Compare value uplift with repair costs; filter demand by feasibility and rank by deadline, then ID. | Work plan, as-is/restored values, proposed rent, first candidate and company approval.                           |
| **4. Smart question flow**     | Apply targeting rules and explain why each question is asked. Prune irrelevant answers after edits; enforce server eligibility and signing guards.                     | Changing answers changes the questions; age, affordability, PEP and authority produce explained outcomes.        |
| **5. Money that adds up**      | Integer cents, exact rational factors, deliberate half-up VAT rounding and original monthly anniversary dates.                                                         | January 31, February/leap-year dates, due dates and net/VAT/gross totals; 2,880 generated schedule cases.        |

**Example:** Aino leases `ebike-003` on 5 November 2026 for 36 months, no down payment. Net rent is **€107.30/month**. The first three gross invoices are **€134.66, €134.66 and €135.20**. The January difference is the challenge’s fictional VAT increase, not a net-rent price change.

For early exit after six completed months, remaining rent is **€3,219.00 net**, capped at the signed **€583.50** buyout. At the fictional 26% VAT, the recorded obligation is **€735.21**. These are synthetic challenge calculations.

See [SMART-PROBLEMS.md](docs/SMART-PROBLEMS.md) for the formulas, policies, code paths and trade-offs.

## Run locally

Requires **Node.js 22**; `.nvmrc` pins the version.

```bash
git clone https://github.com/quietmid/northfina-lease-loop2026.git
cd northfina-lease-loop2026
git checkout feat/lease-lifecycle-team-handoff
nvm install
npm ci
npm run db:setup
npm run dev -- --webpack
```

Open **http://localhost:3000/en**. Select a synthetic customer using **Dev mode**. English, Finnish, Swedish and Estonian are available; the UI follows the system light/dark theme.

For company operations, set a private `LEASE_LOOP_OPERATOR_PASSWORD` in `.env`, restart, click **Company operations**, then sign in. The navigation toggle alone does not authorize company APIs. Never commit `.env` or database files.

## A short demo

1. Select **Aino**, choose an available item, adjust pricing, answer questions and sign. Open **My leases**.
2. Inspect the locked rent and invoice forecast. Expand the VAT-change comparison and calendar dates.
3. For an active lease, calculate an early-exit preview without confirming, or use **Demo: finish this lease** to reach normal completion.
4. Choose **Return my item**, enter usage and submit the return request.
5. Enter **Company operations** and sign in. Open its notification, confirm physical receipt, inspect and review the required work/economics.
6. Confirm completed work. Verify the item stays unavailable pending approval; approve to publish its used offer.
7. Exit company mode, select **Lena**, and lease that same item. Inspect the distinct agreements and retained passport history. Generate invoices from company All operations; view/download them through customer Transactions.

Use [the walkthrough](docs/UI-LIFECYCLE-WALKTHROUGH.md) for precise steps. Imported `ebike-007` and `ebike-008` cover the second/third-life cards and retain intentionally labeled historical counts.

## Engineering and validation

- **Next.js / React / TypeScript**, Tailwind CSS, Prisma + SQLite, Zod and Vitest.
- Pure, tested business logic in `src/domain/`; dates and data are explicit inputs.
- Audited transactional writes, idempotent commands and exclusive asset allocation.
- Safe API error envelopes and customer-scoped invoice/PDF access.
- No AI, ML, LLM model or API inside the product.
- Generated Prisma migrations, conventional commits, hooks enabled and source files below 600 lines.

```bash
npm run check:all       # format, lint, types, size, no-AI, coverage, build
npm test               # focused development suite
npm run db:studio      # inspect the local database
```

`npm run db:reset` deletes current local records and restores the 30 original synthetic assets. It is only for deliberately starting a fresh local test. [The data pack](data/DATA.md) is synthetic; the VAT change and environmental factors are fictional.

## Demo hosting and limits

The current end-to-end demo uses development-only customer switching and company sessions. `npm run build` passes, but a production server intentionally disables demo flows. **Do not publish a normal production build and assume the complete demo is enabled.**

For an immediate public preview, a temporary Cloudflare tunnel can expose a separately seeded local demo. Its link works only while the local server, network and tunnel remain running. See [DEPLOYMENT.md](docs/DEPLOYMENT.md). A durable hosted version needs production identity, an explicit hosted-demo access policy and persistent database storage.

**Known prototype limits:** no real payments or credit-note workflow; no multi-asset fleet contract; shared development company identity rather than individual staff accounts; no rejected-proposal resubmission. Matching is advisory, not a persisted allocation to a waiting-list customer or complete profit optimizer. Impact figures are estimates from fictional factors, not verified savings. Visual browser/keyboard review is still a manual final step.

## Repository map

- `src/domain/` — pricing, eligibility, calendars, tax, exit and circular rules.
- `src/server/` — persistence, ownership, command replay and audit transactions.
- `src/app/` and `src/components/` — customer and company journeys.
- `prisma/` — schema, generated migrations and synthetic seed.
- `docs/` — scenario evidence, team handoff, demo and pitch.

---

## Submitting

Submit from our team fork to **`etufillari/northfina-lease-loop` `main`**. A PR only inside the team fork does not count as the challenge submission.

1. Our team fork is [quietmid/northfina-lease-loop2026](https://github.com/quietmid/northfina-lease-loop2026). Use its final implementation branch and add teammates as collaborators if needed.
2. **Enable Actions in the fork**: open the fork's **Actions** tab and click _"I understand my workflows, go ahead and enable them"_. Now CI runs on every push.
3. Everyone clones the fork and commits as usual. Small, conventional commits; the hooks help.
4. **Before Friday 6 November 16:00**, open a pull request from your fork to `etufillari/northfina-lease-loop` `main`.
   - Title: `Team <name>: <your product name>`.
   - Fill in the template: members, the Smart Problems you picked, and how to demo.
   - You can open it early and keep pushing until the deadline.
5. **At 16:00 we record the latest commit of every open pull request.** That commit is what we judge. Anything pushed later is ignored, and pull requests opened after 16:00 don't count.

We won't merge pull requests. They're only how you hand in your work.

**Heads-up:** forks of a public repo are public, so other teams can see your fork. Your commit history shows who built what, and copying another team's work disqualifies both copies.

---

## Your code is yours

The starter code in this repo is MIT-licensed (see [LICENSE](LICENSE)); use it however you like.

**Your team owns the code you write.** Opening a pull request gives Northfina permission to read and run your code for judging and for interviews with your team. Nothing more: we won't merge it, reuse it or publish it elsewhere without asking you first.

## Help

- During the hackathon: **#ask-a-mentor** on the hackathon Discord.
- A bug in this starter repo: open a GitHub issue here.
- Please follow the [Code of Conduct](CODE_OF_CONDUCT.md).
