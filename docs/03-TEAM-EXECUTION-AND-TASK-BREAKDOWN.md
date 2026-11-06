# Lease Loop: next work steps

Track current implementation status in [PROGRESS.md](PROGRESS.md). Use [team AI rules](TEAM-AI-RULES.md) in each teammate's assistant setup. [Architecture](01-SYSTEM-ARCHITECTURE-AND-CONTRACTS.md) describes the small integration contract; [roadmap](02-PRODUCT-OVERVIEW-AND-ROADMAP.md) sets priorities.

## Who does what

| Person                     | Owns                                          | Start now                                                     | Handoff                                                   |
| -------------------------- | --------------------------------------------- | ------------------------------------------------------------- | --------------------------------------------------------- |
| **Developer 1 — you**      | **Lease engine and invoices**                 | Connect signed terms, then persist leases and invoices        | Lease state, schedule, invoice totals and tax explanation |
| **Developer 2 — teammate** | **Catalogue, application and contract**       | Finish application/eligibility and save signed contracts      | Immutable `LeaseTerms` for the engine                     |
| **Developer 3 — teammate** | **Returns, refurbishment and UI integration** | Build return/inspection workflow with mocked engine responses | Ready asset and second-life offer, connected demo         |

Teammates choose Developer 2/3 according to their existing work; do not overwrite an existing owner's implementation.

## Developer 1 — you: lease engine

**Your scope:** `src/domain/lease-engine/`, future engine services/routes, and their tests.

- [x] Initial pure functions: lease transitions, monthly calendar, VAT and rent invoice calculation. 26 focused tests pass; the Prisma test setup blocker is now fixed locally.
- [x] Consume Dev2's actual signed contract models/mapper and connect atomic signing/activation locally.
- [x] Add engine-only lease persistence and activation adapter. Connecting Developer 2's contract/allocation orchestrator remains pending.
- [x] Add internal invoice persistence/numbering, period uniqueness and idempotency receipts; real-database integration tests pass.
- [x] Register development-only owned lease/schedule/invoice APIs and account controls. Production authentication remains pending.
- [x] Test real signing/engine integration, rollback, replays and account-render smoke. See PROGRESS.md for final evidence.

**Next action:** connect the signed-contract handoff with Developer 2. Until ready, use a fixed `LeaseTerms` fixture to build your persistence adapter. Coordinate Prisma changes before editing the shared schema.

Early-exit settlement comes later. Pure calculations are not stored issued invoices and do not validate eligibility, signing or asset availability.

## Developer 2 — catalogue, application and contract

**Your scope:** existing catalogue/pricing code, application and eligibility rules, signed contracts, their APIs and customer application/signing screens.

- [ ] Continue existing pricing and catalogue work; handle unavailable assets.
- [ ] Save applications and return approved/rejected/manual-review decisions with reasons.
- [ ] Save immutable signed net rent, dates, price version and asset/customer references.
- [ ] Map signed values into `LeaseTerms` from `src/domain/lease-engine/types.ts`; share one realistic fixture with Developer 1.
- [ ] Own contract activation and atomic asset allocation, calling Developer 1's engine adapter in the same transaction.
- [ ] Test eligibility, signing, price lock and activation rollback.

**Next action:** finish one approved application → signed contract and share its terms. Mock the engine while it is being connected; reuse its calendar and invoice calculations.

## Developer 3 — circular lifecycle and UI integration

**Your scope:** returns, inspection, mandatory refurbishment, repricing/second-life workflow, shared UI shell and circular screens.

- [ ] Record return against the original asset and lease.
- [ ] Inspect condition/usage and determine required refurbishment work.
- [ ] Keep the asset unavailable until required work is completed.
- [ ] Create a second-life offer through Developer 2's pricing/contract boundary; preserve the asset ID.
- [ ] Connect lease/invoice outputs to views, then demonstrate a second contract on that asset.
- [ ] Check reloads, clear errors, four locales, keyboard flow and audit history.

**Next action:** build return → inspection → refurbishment with mocked completed-lease data. Consume engine outputs rather than calculating rent or VAT in UI components.

## Integration checkpoints

- Shared handoff: all agree `LeaseTerms`, dates, rounding and ownership; no large freeze sprint needed.
- Module check: each owner tests their own code and fixtures independently.
- Real slice: signed terms → schedule → invoice, then audited persistence and reload.
- Full loop: return → work → offer → second contract on same asset.
- Final check: no duplicate invoices, audit rollback, correct VAT, green `npm run check:all`.

Pull before starting. Use small feature branches and conventional commits. Each owner reviews changes at their boundary. Keep main working; do not wait for every module before integrating the smallest available piece.
