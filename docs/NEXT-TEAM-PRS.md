# Dev2 and Dev3 — original delivery plan

**Status update6 November:** the lead took over remaining circular work; the full local return/re-lease loop is implemented. Use [PROGRESS.md](PROGRESS.md) and [SCENARIO-CARD-RESULTS.md](SCENARIO-CARD-RESULTS.md) for current evidence. The allocation below is historical planning, not a list of still-missing work.

**Target: a complete return-and-re-lease demo by Friday 6 November 2026, 09:00 Helsinki time.** This is our planning target; flag a blocker immediately rather than waiting for the deadline. The official submission deadline remains16:00, per README.

This document covers **Dev2 and Dev3 only**. The first issues are already created. Open all implementation PRs against **quietmid/northfina-lease-loop2026 → main**. Keep PRs small and reviewable; merge working pieces as they pass review instead of waiting for a finished module.

**Morning success:** choose asset → apply → sign → activate → show saved invoices → complete → return → inspect → refurbish → new offer → second customer signs → second lease and invoice on the **same physical asset**.

## Tonight: first PRs — work in parallel

| Owner / PR                                     | Deliverables                                                                                                                                                                                                                | Required proof before review                                                                                                                                                                        |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Dev2 PR1: application → signed contract**    | Application questions and approved/rejected/manual-review reasons; signer/offer/availability guards; persisted immutable signed terms and price version; mapper to `LeaseTerms`; application/signing screen or callable API | Approved applicant can sign; rejected/review/unauthorized cannot; signed rent survives price-list changes and reload; audit failure rolls signing back; share requests/responses and signed fixture |
| **Dev3 PR1: return → refurbishment readiness** | Typed mock completed-lease reader; persisted receipt and inspection; usage/condition validation; required work and costs from pack; recorded work completion/readiness; operator screen or callable API                     | Wrong asset/lease/state rejected; duplicate returns/work do not duplicate records/costs; incomplete mandatory work keeps unavailable; rollback tested; share DTOs and mock fixture                  |

**PR1 handoff: Dev2** supplies this existing engine input (`src/domain/lease-engine/types.ts`). Confirm14-day payment terms with the team; keep price-list version on the signed contract too.

```json
{
  "contractId": "contract-aino-1",
  "assetId": "ebike-003",
  "customerId": "cust-aino",
  "startDate": "2026-11-05",
  "termMonths": 36,
  "monthlyNetCents": 10730,
  "paymentDueDays": 14
}
```

**PR1 handoff: Dev3** supplies actual return/report/work schemas plus a proposed mock lease-reader shape such as `{leaseId, contractId, assetId, status: 'COMPLETED'}`. This is not an existing HTTP response. Real integration must load trusted engine state; browser-supplied completion status is not proof.

## After PR1: connect the real services

| Owner / PR                                                | Deliverables                                                                                                                                                                                                                | Required proof before review                                                                                                                                                      |
| --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Dev2 PR2: real activation and contract closure**        | Contract-owned audited orchestrator: check signed/approved terms, acquire exclusive asset allocation, call the agreed engine transaction adapter, mark contract active; synchronize contract closure with engine completion | One transaction rolls back everything on failure; retry returns same lease; competing contracts cannot acquire one asset; closure does not release the physical asset prematurely |
| **Dev3 PR2: real lease/invoice UI and return connection** | Replace mock reader with agreed real engine adapter; display supplied schedule/invoice totals; connect completed lease to receipt/inspection/work screens; visible loading/error/retry states                               | Real signed contract can reach saved invoices, completion and physical return; reload each screen; no mock-only success in demo path; no UI recalculation of VAT/rent             |

**Integration dependency:** engine persistence and mock activation interfaces currently exist on local `feat/engine-persistence` review work; confirm their shared PR/commit before importing them. Public HTTP routes and trusted authorization are not assumed ready. Use agreed server adapters while awaiting routes, and coordinate any cross-domain interface change. The engine foundation and `LeaseTerms` are already in team main.

Dev2 can call `activateLeaseInTransaction(tx, terms, activatedOn)` and `completeLeaseInTransaction(tx, leaseId, asOf, expectedVersion)` once shared, or agree the proposed contract-provider port with the engine owner. Pick **one** contract activation orchestrator; do not build competing flows.

## Before the morning demo: close the physical loop

| Owner / PR                                           | Deliverables                                                                                                                                                                              | Required proof before review                                                                                                                                                           |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Dev3 PR3: circular valuation and real history**    | Deterministic second-life valuation from condition/usage/refurbishment data; ready-asset handoff to catalogue owner; minimal passport/history view; circular screen flow                  | Explain valuation/costs; required work gates readiness; preserve assetId/serial; recorded replacement justifies any usage reset; history contains real facts, not invented past leases |
| **Dev2 PR3: publish offer and sign second contract** | Publish new offer using circular valuation/readiness; release/reacquire allocation through guarded owner operations; second customer follows the same application/signing/activation path | Same physical asset becomes leasable only when ready; new contractId and leaseId; second lease activates and its first invoice is saved through the existing engine                    |
| **Dev3 PR4: demo and UX fixes**                      | One navigable persisted journey; four locales; keyboard labels/focus/errors; show tax explanation, invoices and audit/history                                                             | Two clean rehearsals; reloads/retries work; no mock dependency left in final loop; report remaining limitations                                                                        |

Dev2 and Dev3 pair at the valuation/readiness → published-offer boundary. Dev3 owns readiness/valuation; Dev2 owns catalogue availability, offer publication and signing. Do not each implement a separate second-life pricing or availability workflow.

## Coordination checkpoints — Helsinki time

These are target windows, not claims that work is already complete. If starting after a window, report the remaining gap and prioritize the next integrated checkpoint.

- **Before stopping tonight:** both PR1s open with fixtures/tests and any blockers; review immediately. Do not wait until morning to expose interfaces.
- **By07:00 Friday:** real activation → first invoices and real completed lease → return path connected. Share exact reproduction steps.
- **By08:00:** refurbishment → new offer → second contract/lease and invoice works on the same asset. Freeze optional features.
- **08:00–09:00:** fix integration failures, run full checks in a supported environment and rehearse the complete loop twice.

If blocked, post **what failed + needed interface/owner + smallest workaround** in the issue/PR. Keep building independent rules/screens with explicit mocks while waiting. Never mark a mocked join as integrated.

## Shared acceptance checklist for the morning

- [ ] One approved application → immutable signed contract → active lease, all persisted.
- [ ] Aino/ebike-003 signed Nov5: Nov/Dec net10730, VAT2736, gross13466 cents; Jan2027 net10730, VAT2790, gross13520 cents.
- [ ] Invoice/activation retries do not create duplicates; audit failure rolls back changes.
- [ ] Explicit completion date closes lease/contract without pretending the first3 displayed invoices settle all36 months.
- [ ] Real return → inspection → mandatory refurbishment → ready asset.
- [ ] New offer → second customer's contract → second active lease and first saved invoice.
- [ ] AssetId/serial unchanged; contractId/leaseId changed; no double allocation.
- [ ] Four locales, safe errors, reloads and basic keyboard flow checked.
- [ ] `npm run check:all` passes in the review/CI environment. This runner's known Turbopack port restriction is not a green build; verify elsewhere if it persists.

## Remaining challenge work after the morning loop

The return loop is the priority for09:00, not the whole submission scope. **Dev2** completes guarded buyout/pass-on contract/allocation branches with agreed settlement inputs. **Dev3** adds their end-option screens: buyout removes stock from leasing, pass-on uses a newly approved contract rather than rewriting an old customer. Coordinate engine charges/closure interfaces before implementation.

Verify saved-quote/sign policy, VAT/calendar scenarios and all relevant challenge cards before the16:00 submission. Advanced demand matching, CO₂, fleet dashboards and early-exit fees stay deferred while required behavior is missing. Never return fake success for an unfinished end option; record the gap honestly.

## Rules and PR handoff

Read `AGENTS.md`, `docs/START-HERE.md` and `docs/TEAM-AI-RULES.md`. Business rules stay pure/tested in `src/domain/`; all writes use `withAudit()` and its `tx`; amounts are cents; routes use existing envelopes; new UI strings go into all four locales. The development user cookie is not authentication; agree trusted server access before exposing mutations.

Coordinate shared Prisma/type/package changes before editing. One person generates each migration with the CLI. Do not duplicate the lease engine or change consumed types silently.

Every PR includes **what works, exact screen/request to try, model/API names, sample handoff JSON, tests/results, remaining mocks/gaps and shared-file changes**. Link the issue. Update your rows in [PROGRESS.md](PROGRESS.md) with the PR link and evidence; review owners fix their domain's failures.
