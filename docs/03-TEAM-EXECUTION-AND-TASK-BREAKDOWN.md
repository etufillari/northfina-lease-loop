# Lease Loop: next work steps

Use [team AI rules](TEAM-AI-RULES.md) in each teammate's assistant setup. [Architecture](01-SYSTEM-ARCHITECTURE-AND-CONTRACTS.md) describes the small integration contract; [roadmap](02-PRODUCT-OVERVIEW-AND-ROADMAP.md) sets priorities.

## Engine developer (me)

1. First increment: pure lease transitions, anniversary calendar, invoice-date VAT and rent invoice calculation, with colocated edge tests. Files: `src/domain/lease-engine/`.
2. Connect signed contract terms from the spine owner. Confirm actual contract schema and naming before writing adapters.
3. Add audited lease activation and invoice issuance, unique period key, idempotency receipts and atomic asset allocation with the spine owner. Coordinate generated migrations.
4. Add engine APIs using existing envelopes; test concurrent issuance, rollback and same-key replay.
5. Show first three invoices and VAT/calendar scenarios. Add settlement/early exit only after agreeing the fee policy.

First increment deliberately has no database/API writes, invoice numbering, signing/eligibility checks or settlement. Consumers must not treat a pure calculation as a stored issued invoice.

## Spine developer

1. Continue existing catalogue/pricing/application work.
2. Save approved application and signed contract with locked net rent, dates and stable asset/customer references.
3. Supply `LeaseTerms` from `src/domain/lease-engine/types.ts`. Mock engine output if needed; do not create a competing invoice calculator.
4. Pair on atomic activation and invoice persistence boundary. Keep catalogue pricing separate from signed terms.

## Circular/UI developer

1. Build return, inspection and required refurbishment rules with mocked completed lease and invoice responses.
2. Reprice ready assets and feed offers back through the existing contract flow.
3. Connect engine output to invoice views; preserve one physical asset identity across lives.
4. Orchestrate the complete demo and check errors, locales and keyboard navigation.

## Integration checkpoints

- Shared handoff: all agree `LeaseTerms`, dates, rounding and ownership; no large freeze sprint needed.
- Module check: each owner tests their own code and fixtures independently.
- Real slice: signed terms → schedule → invoice, then audited persistence and reload.
- Full loop: return → work → offer → second contract on same asset.
- Final check: no duplicate invoices, audit rollback, correct VAT, green `npm run check:all`.

Pull before starting. Use small feature branches and conventional commits. Each owner reviews changes at their boundary. Keep main working; do not wait for every module before integrating the smallest available piece.
