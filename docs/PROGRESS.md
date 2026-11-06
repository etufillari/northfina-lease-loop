# Lease Loop — integration progress

Updated6 November2026 after pulling team main at `b04cd0e` (Dev2 PR12 merged). Local integration branch: `feat/engine-persistence`. **Local working code is not automatically pushed or merged.**

## Where we are

**Working locally, including rendered account UI:** catalogue → approved application → signed contract → active engine lease → three saved invoices → completed lease awaiting physical return.

**Not connected yet:** physical return → inspection → refurbishment → ready offer → second customer/contract/lease. No Dev3 return/refurbishment implementation was found in fetched team main.

## Team status

| Owner                           | Verified output                                                                                                                                                                                      | Next required output                                                                                                                                                                   |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Dev1 — engine/integration**   | Signed contract and engine lease/allocation now commit atomically; invoice numbering, tax snapshots, duplicate protection, completion; live development-only engine endpoints and account invoice UI | Review/publish local integration; agree return/allocation release adapter with Dev3; complete final loop and production auth/build validation                                          |
| **Dev2 — application/contract** | PR12 merged: approved/rejected/review decisions, saved signed terms, `LeaseTerms` mapper, checkout/account UI                                                                                        | Review integration hook and permanent reservation change; correct remaining eligibility/question-flow edge cases; coordinate second-life offer and new contract; buyout/pass-on remain |
| **Dev3 — circular/UI**          | Existing end-option selector is UI-only; no verified persisted return/work flow in current main                                                                                                      | Deliver receipt/inspection/mandatory work/readiness and valuation; real passport/history; connect second-life handoff, preserving asset identity                                       |

See [NEXT-TEAM-PRS.md](NEXT-TEAM-PRS.md) for teammate deliverables. First issues exist; record their actual PR/issue links when available.

## Completed local integration

- [x] Safely pulled Dev2 changes; schema conflict resolved by retaining both contract and engine models. Stash backup retained.
- [x] Added an optional transaction callback to Dev2 signing; new `signAndActivateContract()` creates lease and unique asset allocation inside that same audited transaction.
- [x] Signing clears reservation expiry so a signed asset cannot be reclaimed as an expired shopping reservation.
- [x] Existing signed contracts can be activated idempotently from the account page after ownership checks.
- [x] Account reflects real SIGNED/ACTIVE/COMPLETED state, without mock fallback or claiming invoices are paid.
- [x] Account shows saved invoice numbers, dates, net/VAT/gross and total scheduled net; generate-first3 and demo completion controls work.
- [x] Development API controls reject production mode, cross-origin writes and other customers' leases. This is a local demo adapter, not production authentication.
- [x] Completion retains physical allocation/unavailability for the return workflow.
- [x] Generated/applied migrations using Prisma CLI; existing development DB preserved, no reset.

## Verification

- Real service integration tests use Dev2 application/signing plus actual temporary SQLite, not the mock contract provider.
- Historical Aino scenario: Nov5 v1 net10730 cents; first gross13466,13466,13520. Audit failure rolls back contract, signing state, lease and allocation.
- Actual HTTP/rendered-page smoke test on isolated SQLite: approved application → sign/activate → first3 saved invoices → exact replays → account HTML contains invoice numbers → completed state awaiting return. No development database business data was used for this smoke test.
- Current-date Nov6 smoke used price-list v2: net11265 cents, gross14138/14138/14194; this differs correctly from the historical Nov5 scenario.
- Final `npm run check:all`: formatting/lint/types/file-size/no-AI/coverage pass; **225 tests pass across29 files**, coverage lines95.23%, branches86.7%, functions95.86%, statements92.62%. Default Turbopack build remains blocked by the runner's port restriction, including an escalated run. **Supplemental `npm run build -- --webpack` passes the complete production build.** Default CI command unchanged; default full gate is not claimed green.
- UI smoke verified rendered HTML and HTTP actions, not a visual browser/keyboard audit.

## How to try locally

1. Run `npm run dev` (use `npm run dev -- --webpack` if this runner blocks Turbopack workers).
2. Select Aino in the development customer switcher.
3. Choose an available asset, finish the application and sign. The account page opens with a real active lease.
4. Expand the lease and click **Generate first3 invoices**. Reload: invoices remain saved.
5. Click **Complete at contract end (demo)**. It uses the contractual end date; it does not mark invoices paid or release the asset.
6. Previously signed contracts without a lease show **Activate signed contract**.

Your real development database has received additive migrations only. The isolated smoke database is separate.

## Remaining requirements for the full loop

- [ ] Dev3: persisted physical return, condition/usage inspection, mandatory work/costs and readiness; audited/idempotent changes.
- [ ] Shared: release `EngineAllocation` only through the agreed ready-for-reuse/ownership-transfer transaction, never at lease completion alone.
- [ ] Dev3 → Dev2: valuation/readiness → publish second-life offer → approved new contract, keeping assetId/serial.
- [ ] Activate second lease with new contract/lease IDs and issue its first invoice; rehearse the complete loop twice.
- [ ] Replace decorative end-option selection with guarded buyout/pass-on behavior; payment/credit/early-exit settlement are not implemented.
- [ ] Production authentication/authorization and existing application/read-route access hardening; dev customer IDs are not a public security boundary.
- [ ] Full default build/CI green in supported environment; four-language visual/keyboard QA and final challenge scenarios.

Update status only with code/PR/test evidence. Keep local-review work distinct from merged team main.
