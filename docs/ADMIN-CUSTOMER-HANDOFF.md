# Next PR: separate customer and company operations

Build on `feat/circular-lease-loop`. The full demo loop works locally: contract → lease/invoices → return → inspection → refurbishment → used offer → next lease. See [UI walkthrough](UI-LIFECYCLE-WALKTHROUGH.md).

## Deliver next

1. **Customer view:** catalogue, application/signing, own contracts, invoices and end-of-lease choice. Show return instructions and return status. Customers must not receive items, record inspections, confirm workshop work, publish offers or use demo time controls.
2. **Admin/operator view:** lease operations, physical receipt, inspection, required work, asset passport and company review. Move development controls here and label them clearly.
3. **Company approval before offering another lease:** after required refurbishment, save the proposed condition, usage, costs and price as pending approval. Keep the asset unavailable and do not publish a CircularOffer yet. An authorized company reviewer approves the proposal before publication. A rejected proposal stays unavailable with a recorded reason.

## Important current behavior

The basic role split is implemented for the development demo: the catalogue links to the operator workshop, the customer account no longer links to operator controls, and the workshop API uses a same-origin development-only operator identity without requiring a selected customer. This is not production authentication. Company approval is **not implemented yet**. Completing financeable refurbishment currently publishes the offer immediately. Low-value items save completed work as `REVIEW_REQUIRED` without an offer; this is a financing exception, not company approval.

## Implementation boundaries

- Reuse `src/server/circular/service.ts`, its audited/idempotent commands and existing domain calculations. Do not build a second lease engine.
- Enforce customer ownership and operator/reviewer authorization on the server. Hiding buttons is insufficient. Use a trusted server identity; never accept a role from the request body.
- Approval must atomically publish the approved price and make the asset available. Preserve the original contract/invoices and asset identity. Block duplicate publication and leasing before approval.
- Any proposal edit after approval must require fresh review before a new offer can be published. Record reviewer, date, decision and rejection reason in the audit trail.
- Follow AGENTS.md: generated Prisma migrations, pure tested domain logic, integer cents, audited writes and four-language UI strings.

## Acceptance checks

- A customer can request a return but cannot call workshop or approval mutations, including direct API requests.
- Completed workshop work creates a pending proposal; catalogue/application API cannot offer it yet.
- Company approval publishes exactly one offer; rejection leaves the asset unavailable.
- Invalid financing amounts remain blocked even if a reviewer attempts approval.
- Retry, conflicting/stale review and proposal-edit cases preserve consistent state and audit history.
- A second customer can sign and start the next lease only after approval. Run `npm run check:all` and repeat the walkthrough.
