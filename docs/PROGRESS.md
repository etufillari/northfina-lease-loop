# Lease Loop — current progress

Updated6 November2026. User/project lead explicitly took over Dev3's remaining work. Branch: **`feat/circular-lease-loop`**, based on pushed engine commit `67d7e71`. Circular implementation is ready for team review; merging remains a separate step.

## Working now

**Catalogue → price → application/decision → signed contract → active lease → recurring saved invoices → completion → physical return → inspection → confirmed mandatory refurbishment → used-asset offer → second customer → second lease/invoice on the SAME asset.**

Real temporary SQLite and HTTP/rendered UI smoke verified that loop. The new account/workshop UI uses persisted data, not fake lease/payment results.

## Completed in this increment

- [x] Lead assumed circular/domain/UI ownership; existing engine and Dev2 integration preserved.
- [x] Persisted return/inspection/work plan/readiness; idempotency and audit rollback.
- [x] Usage/condition validation; required safety/battery/wipe/service tasks; no allocation release before completion.
- [x] Dated used-price publication integrated into catalogue/application quotes, with unchanged original signed terms.
- [x] New contract and lease for the next customer; physical asset ID/serial retained.
- [x] Passport with actual leases, audit history, work/costs, labeled imported history and fictional impact estimate.
- [x] Deterministic advisory matching by feasibility, deadline and stable ID.
- [x] Guarded return/pass-on/buyout actions and agreed early-return policy; obligation records never pretend payment received.
- [x] Submitted applicable question answers persisted/evaluated; irrelevant answers pruned; signer/PEP flags cannot be upgraded away.
- [x] Gross30% consumer affordability, supported residency and sole-trader age checks.
- [x] Exact rational price arithmetic;259 tests, including2880 generated schedule cases.
- [x] Four-language UI keys for new features, meaningful rejection/review text.
- [x] Generated/applied additive Prisma migrations; dev.db preserved.
- [x] Production build uses supported Next Webpack mode to avoid the runner's Turbopack worker-port restriction. All original checks remain enabled.

## Validation

**`npm run check:all` PASSES:** formatting, lint, typecheck, file-size, no-AI, coverage and production build.259 tests across39 files. Coverage: lines95.17%, branches86.75%, functions96.07%, statements91.58%.

Real HTTP/render smoke on a fresh isolated database included two customers, unchanged physical asset ID, new contract/lease IDs, old invoice preservation, imported cards9/10, replay, buyout and pass-on. It checked rendered HTML and API actions; a visual browser/keyboard audit has not been performed.

See [SCENARIO-CARD-RESULTS.md](SCENARIO-CARD-RESULTS.md) for card-by-card evidence, policy assumptions and the short demo script.

## Next team PR

Separate customer/admin views and add company approval before publishing the next lease offer. This gate is not implemented yet: eligible workshop completion currently publishes immediately. Follow [ADMIN-CUSTOMER-HANDOFF.md](ADMIN-CUSTOMER-HANDOFF.md).

## Next actions

1. Review this circular branch, repeat the demo manually, and open a PR into the TEAM fork.
2. Focus pitch/depth on VAT/price lock and money/calendar correctness; add only fixes justified by card failures.
3. Complete four-language visual/keyboard QA and two4-minute rehearsals; keep CI green and follow README submission deadline.

## Explicit prototype limits

- Account/workshop write controls use development-only selected-customer/operator mode and same-origin checks. Production authentication is not implemented.
- Payment collection/reconciliation and credit-note processing are not implemented; charges are recorded obligations. Early exit refuses to change already-issued future rent without credits.
- New contracts snapshot buyout/exit terms. Legacy contracts without those snapshots reject unknown fees; ordinary return still works.
- Card6 signer guard is tested; a true4-asset fleet contract is not implemented.
- Matching is an advisory ranked list, not queue fulfillment or a profit optimizer. Imported history is summarized, not fabricated.
- Manufacture-age/service-history assumptions and fictional CO₂ methodology are documented in the scenario report.

These limits do not remove the demonstrated single-asset return-and-re-lease spine. Do not describe this local prototype as production lending/payment readiness.
