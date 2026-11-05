# Lease Loop — team overview and AI boundaries

## What we are building

**Choose an item → apply → sign → monthly invoices → return → refurbish → lease again.**

First make this journey work for one asset. Keep its asset ID through every life; create a new contract and lease for each new customer. All product decisions use rules and data, with no AI inside the app.

## Who owns each domain?

| Owner                                                             | Owns and implements                                                                                                                                                                            | Does not implement                                                                            |
| ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| **Developer 1 — me: Lease engine**                                | Lease activation/completion rules, billing calendar, locked-rent enforcement, invoice-date VAT, invoice calculation/issuance, duplicate protection and engine APIs/tests                       | Catalogue pricing offers, application eligibility, contract signing, returns or refurbishment |
| **Developer 2 — teammate: Catalogue, applications and contracts** | Asset catalogue/availability, pricing offers, application questions, eligibility, signed contract terms, contract activation orchestration, application/signing screens and related APIs/tests | A separate billing calendar, VAT/invoice engine, inspection or refurbishment rules            |
| **Developer 3 — teammate: Circular lifecycle and UI integration** | Return receipt, inspection/condition, mandatory refurbishment, readiness, second-life valuation, passport, shared UI shell/circular screens and demo integration                               | Application eligibility, contract signing, invoice calculations or changes to signed rent     |

Confirm which teammate takes Developer 2/3 based on work already started. Existing authors keep ownership until the team agrees a handoff. Developer 3 coordinates UI integration; each domain owner remains responsible for their rules and APIs.

## How the domains connect

- **Developer 2 → Developer 1:** provide signed `LeaseTerms` from `src/domain/lease-engine/types.ts`: contract/asset/customer IDs, start date, term, locked monthly net cents and payment terms. The engine must not fetch today's catalogue price to recalculate signed rent.
- **Activation:** Developer 2 owns contract status and asset allocation; Developer 1 supplies the lease adapter. Commit these changes together in one audited transaction. Neither owner independently starts a competing activation workflow.
- **Developer 1 → Developer 3:** provide lease state, schedule and invoice results. The UI displays these values rather than recalculating rent, dates or VAT.
- **Developer 3 → Developer 2:** provide inspected condition, usage, refurbishment readiness and second-life valuation. Developer 2's catalogue/offer boundary publishes the leasable offer and creates the next contract. Developer 3 does not bypass availability or signing rules.

Use mocks when a neighboring module is unfinished. Changing a handoff requires agreement from its producer and consumers.

## Instructions for every AI agent

Start each session with: **“My role is Developer [1/2/3]. Read AGENTS.md, docs/START-HERE.md and docs/TEAM-AI-RULES.md before editing. Work only within my domain.”**

1. **Inspect first.** Check the branch, local changes and existing implementation. Preserve teammates' work; never reset or overwrite it to make your task easier.
2. **Stay inside your domain.** Own its pure rules, server adapters, routes and tests. Folder names alone do not grant ownership of another domain's behavior.
3. **Do not duplicate another engine.** Import its public function or use its API. If unavailable, use a small mock with the agreed input/output; do not ship a competing implementation.
4. **Coordinate cross-domain changes first.** State the affected owner, proposed interface and files. Continue independent work while waiting; do not silently edit their internals or change consumed types.
5. **Coordinate shared files.** Prisma schema/migrations, package files, shared types/components, AGENTS.md and locale JSONs affect everyone. Agree the specific change; one person generates a migration at a time. New namespaced locale keys are fine when coordinated; preserve others' keys.
6. **Keep rules pure and tested.** Business logic belongs in `src/domain/`, with colocated Vitest tests. Pass dates/data in; no database, network, clock or randomness. Money is integer cents with explicit rounding.
7. **Use repository safeguards.** Every data change uses `withAudit()` and its `tx`; routes use `ok()/fail()/handleRoute()`. Generate Prisma migrations; never hand-write SQL. Update all four UI languages. Keep files under600 lines; no product AI.
8. **Verify and hand off.** Run focused tests and `npm run check:all`. Report changed files, public inputs/outputs, test results and remaining gaps. Never bypass hooks or claim failed checks passed.

For a task spanning domains, split the work by owner and agree the connection. Do not let one AI agent take over another member's domain just to complete the whole flow.

## Where we are now

This is a snapshot of the inspected checkout, not a live status of every teammate's branch:

- Catalogue/pricing UI, term/down-payment controls and four languages exist.
- Initial engine functions for lease transitions, monthly dates and VAT/invoice calculations passed 26 focused tests. They do not yet save or issue invoices.
- Applications/contracts and return/refurbishment still need integration here; inspect teammates' latest work before starting them.
- Full checks stop at Prisma test-database setup. This must be fixed before claiming the complete app is validated.
- Engine/role docs were pushed to `feat/team-roles-and-engine` in **quietmid/northfina-lease-loop2026**. A pushed branch is not automatically merged into `main`; check the team fork's PR status.

## Next steps

1. **Developer 2:** finish one approved application → signed contract; share its `LeaseTerms`.
2. **Developer 1:** connect those terms, persist lease/invoice data and prevent duplicate issuance.
3. **Developer 3:** build return → inspection → refurbishment with mocks, then connect real services.
4. **Together:** demonstrate a second lease on the same asset, changing VAT, correct month-end dates and green checks.

Advanced matching, CO₂ and early-exit fees wait until the full loop works. See [TEAM-AI-RULES.md](TEAM-AI-RULES.md) for the shared working rules and [architecture](01-SYSTEM-ARCHITECTURE-AND-CONTRACTS.md) for engine interfaces.
