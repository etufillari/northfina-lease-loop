# My next steps — Developer 1 and project manager

My goal: **one signed contract → active lease → saved invoices → completed lease → asset ready for return.** Then connect the team's return/refurbishment flow and start a second lease.

Current status and evidence: [PROGRESS.md](PROGRESS.md). The assignments below have been dispatched.

## 1. Dispatch work to the team

Confirm each teammate's role. Send these short assignments; everyone reads `AGENTS.md`, `docs/START-HERE.md` and `docs/TEAM-AI-RULES.md` first.

**Send to Developer 2 — catalogue/application/contract:**

> Build one approved application → signed contract using the existing catalogue/pricing work. Save the agreed monthly net rent and price version. Give me a realistic `LeaseTerms` fixture matching `src/domain/lease-engine/types.ts` and tell me your contract model/API names. Own contract activation and asset allocation orchestration; we will connect my engine adapter in the same audited transaction. Do not duplicate billing/VAT logic. Continue with a mocked engine while I build persistence.

**Send to Developer 3 — circular lifecycle/UI:**

> Build return receipt → inspection → required refurbishment → ready-for-lease state, using mocked completed-lease data. Keep the same asset ID. Connect repricing/reoffer through Developer 2's catalogue boundary. Own the circular screens and UI integration; consume engine invoice totals instead of recalculating them. Share the lease-state fields and API responses you need.

**My coordination tasks:**

- [ ] Confirm owners and their existing branches; avoid restarting work already done.
- [ ] Agree the signed-term handoff and one shared example with Developer 2.
- [ ] Agree the completed-lease handoff with Developer 3.
- [ ] Choose one person to generate coordinated Prisma migrations; each owner reviews their models.
- [ ] Set the first integration checkpoint: one approved contract activated and one invoice saved/reloaded. Agree a time with the team.
- [ ] Keep advanced matching, CO₂ and early-exit fees out of this first checkpoint.

Mock contract handoff is now implemented for tests; see `src/server/lease-engine/contract-activation.test.ts`. Real contract integration remains pending.

## 2. My implementation order

- [ ] **Check latest code.** Inspect local changes and safely sync the team branch/main before editing. Work on a feature branch in the team fork.
- [x] **Fix the test blocker.** Pre-create the temporary SQLite file before Prisma migrations; existing tests now run.
- [ ] **Agree models and interfaces.** Use Developer 2's actual signed contract structure. Keep immutable agreed terms separate from mutable lease state. Coordinate lease/invoice/allocation/receipt constraints before generating migrations.
- [ ] **Persist activation.** Supply the engine's transaction-scoped adapter. Developer 2's orchestrator checks signing/eligibility/availability and commits contract activation, asset allocation and lease creation through one `withAudit()` transaction.
- [x] **Persist invoices (internal service).** Reuse `calculateInvoice()`. Save the selected tax rule, amounts, period and signed-term reference. Add safe invoice numbering, a unique rent-invoice key per lease/period and scoped idempotency receipts.
- [ ] **Expose engine APIs.** Add lease state/schedule/invoice operations using `ok()/fail()/handleRoute()`, trusted actor and resource access checks. Do not treat the development user switcher as authentication.
- [ ] **Persist completion.** Pass an explicit business date, close the lease and synchronize contract status through the agreed transaction boundary. Keep the asset unavailable until the return/refurbishment workflow releases it.
- [x] **Test the engine persistence slice with signed-term fixtures.** Seven integration tests pass. The test below remains the target for full contract/allocation integration before connecting the UI and return flow.

Business rules remain pure in `src/domain/lease-engine/`. Database calls, IDs, clocks and transactions belong in server adapters. Generate migrations with `npm run db:migrate`; never write migration SQL by hand.

## 3. First automated test: a working lease lifecycle

**Test name:** `activates a signed lease, issues invoices once, and completes without releasing the asset`.

Put it in a discovered location such as `src/server/lease-engine/lifecycle.integration.test.ts` when the adapters exist. Use the real temporary SQLite test helper and real services, not mocked persistence. Never use or reset the team's development database.

**Arrange**

- One available `ebike-003` and customer `cust-aino` in the test database.
- An approved application and signed contract from Developer 2's fixture/provider.
- Signed terms: start `2026-11-05`, 36 months, zero down payment, locked monthly net **10730 cents**, payment due in **14 calendar days** (confirm this policy with the team).
- Validated pack VAT rules: 25.5% through December2026; fictional26% from January2027.
- Explicit IDs, actor, request keys and dates. Do not change the machine clock.

**Act and assert**

1. Activate on `2026-11-05`. Reload: one ACTIVE lease, active contract and one allocation for the asset.
2. Issue periods1–3. Reload and verify:

   | Period | Issue date | Due date   | Net cents | VAT cents | Gross cents |
   | ------ | ---------- | ---------- | --------- | --------- | ----------- |
   | 1      | 2026-11-05 | 2026-11-19 | 10730     | 2736      | 13466       |
   | 2      | 2026-12-05 | 2026-12-19 | 10730     | 2736      | 13466       |
   | 3      | 2027-01-05 | 2027-01-19 | 10730     | 2790      | 13520       |

3. Repeat period1 with the same idempotency key: same invoice ID, still three invoices. A new key for that period must not create another rent invoice; agree whether it returns the existing result or a conflict. Reusing a key with a changed payload must conflict.
4. Change the current catalogue price. Existing signed rent and issued invoice amounts stay unchanged.
5. Complete with explicit date `2029-11-05`. Reload: lease and contract COMPLETED; asset still unavailable awaiting return. This tests lifecycle state, not a claim that three invoices settle all36 months or that they were paid.
6. Verify audit records for committed changes and no duplicate lifecycle records from retries.

**Pass means:** state, invoices and audit survive reload; VAT changes without changing signed net rent; retries do not duplicate invoices; completion does not prematurely release the physical asset.

## 4. Before calling the slice reliable

- [ ] Two concurrent requests for the same period create exactly one invoice.
- [ ] Audit failure rolls back the whole invoice/activation change.
- [ ] Another contract cannot acquire the same allocated asset.
- [ ] Existing calendar tests cover Jan31 → Feb28/29 → Mar31.
- [ ] Full schedule net equals **386280 cents** for36 rents; buyout is separate. Future gross totals depend on VAT assumptions.
- [ ] `npm run check:all` passes, with no bypassed hooks.

## 5. Team demo after this test passes

Developer 2 signs → I activate and show invoices → I complete using an explicit demo date → Developer 3 receives/inspects/refurbishes → Developer 2 creates the next contract → I activate its lease on the **same asset ID**.

At each checkpoint report only: **what works, what blocks us, who owns the next action**. Push small conventional commits and open PRs against `quietmid/northfina-lease-loop2026`, not the original project repository.
