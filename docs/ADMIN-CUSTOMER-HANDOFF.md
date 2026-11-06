# Customer / company handoff — implemented locally

## Working separation

- **Customer:** catalogue, application/signing, own leases/invoices, read-only invoice forecast and end choice. Return shows physical handover instructions.
- **Company:** separate password sign-in at `/en/circular`, invoice generation, demo completion, physical receipt, inspection, work confirmation and offer review.
- Customer identity alone cannot authorize company mutation APIs. Exception: the explicitly labeled development-only `/demo-complete` simulation lets a customer advance their own lease to its agreed end; it cannot receive items, issue invoices or approve offers. The session is signed, HTTP-only and expires after four hours. Access is development-only; real staff identities are still future work.

## Offer gate

**Required work completed → PENDING_APPROVAL → company approves → READY / published offer.**

Before approval the asset stays unavailable, with its allocation held. Approval atomically publishes one offer, makes it available and records reviewer/date. Rejection requires a reason and keeps it unavailable. Financing exceptions cannot be approved. Decisions and work commands are audited and idempotent.

Proposals cannot be edited after submission in this prototype. Rejection is terminal; a future edit/resubmission feature must require a fresh review. Historical offers published before the gate remain unchanged.

## Files to build on

- `src/server/circular/service.ts`: finish saves work; `reviewRefurbishment()` handles approval/rejection.
- `src/server/circular/operator-session.ts` and `demo-operator.ts`: development company session and server permission check.
- `src/app/api/operator/session/route.ts`: sign-in/sign-out.
- `src/app/[locale]/circular/page.tsx`: company workspace.
- `src/components/lease-engine-panel.tsx`: read-only customer panel; operator controls only in the company workspace.
- `src/components/invoice-forecast.tsx`: signed schedule/VAT projection using the existing domain engine.

Set `LEASE_LOOP_OPERATOR_PASSWORD` in local `.env` and restart. Never commit credentials. Follow [UI-LIFECYCLE-WALKTHROUGH.md](UI-LIFECYCLE-WALKTHROUGH.md) to verify the full loop. All future changes must follow AGENTS.md.

## Team integration

Team main `92db65e` is pulled. Keep its Company operations toggle, admin profile, return-request form and Returned queue. The signed operator session remains required for company APIs; a mode cookie alone is insufficient. Return notifications poll the protected `/api/operator/notifications` endpoint and clear when a REQUESTED item is physically received. The full customer request → notification → receipt → approval → second lease passed HTTP checks on an isolated database.
