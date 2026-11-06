# Engine persistence handoff

These are internal server services, not authorized HTTP routes. Caller supplies a trusted actor, idempotency key and server-loaded VAT rules. Never accept signed terms or tax rates directly from an untrusted invoice request.

- `activateLeaseInTransaction(tx, terms, activatedOn)` creates the engine row. Dev2 calls this after checking approved/signed contract and acquiring asset allocation, inside the same `withAudit()` transaction as its own writes. It does not modify contract/asset tables.
- `completeLeaseInTransaction(tx, leaseId, asOf, expectedVersion)` closes the engine row in the caller's transaction. Dev2 synchronizes contract status there. It does not release the asset.
- `activateLease()` and `completeLease()` are audited standalone entrypoints for fixtures/internal integration. They do not prove signing, eligibility, availability or payment settlement.
- `issueInvoice(db, context, {leaseId, periodIndex}, rates)` persists rent calculations, tax snapshot, invoice number and command receipt atomically. Same actor/operation/key replays exactly; changed payload conflicts; another key for the same lease/period conflicts. Counter updates roll back on failure. Tax-provider changes do not rewrite a replayed invoice.
- `getLease()` and `listLeaseInvoices()` return transport-safe values. `queries.ts` adds `getLeaseByContract()`, `getInvoice()` and `getLeaseSchedule()`; schedule reads do not issue invoices and invoice reads return stored tax/amounts. Auth/resource ownership must be checked before exposing them through routes.

Amounts/date rules come from the pure engine. Persistence restricts amounts to Prisma Int bounds, in euro cents. Issued invoices are immutable; payment/credit/termination settlement is not implemented. Historical periods remain issuable after natural completion. The provider selects tax by the scheduled invoice date; backdating/delayed issuance policy must be agreed before public operational use.

Receipts and engine business keys are database-unique. Retry up to three attempts on recognized transaction/uniqueness conflicts; final failures propagate for the future route's safe error mapping. Every successful command invocation, including an exact replay, records an audit entry named `engine.<operation>_command`; a replay adds no business row or receipt.

Test with `npm test -- src/server/lease-engine/lifecycle.integration.test.ts`. Tests use migrated temporary SQLite, never dev.db. The sample lease exercises only the engine: it does not claim contract/allocation integration is finished.

## Mock-first contract activation

`contract-activation.ts` defines a proposed `ContractActivationPort` and `activateFromSignedContract(db, context, {contractId, activatedOn}, port)`. The request carries references/dates only; signed prices come from the server-side port inside the transaction. The port checks signing/eligibility and acquires allocation in `prepareActivation(tx, contractId)`, then marks the contract active in `recordActivation(tx, contractId, leaseId)`. All adapter writes use that tx. Request replay skips the provider and returns the stored result.

The mock lives only in `tests/fixtures/mock-contract-activation.ts`: approved/signed terms are fabricated, asset reservation uses a real test DB write to prove rollback, and contract-state persistence is intentionally absent. Nothing registers it in application routes. Test with `npm test -- src/server/lease-engine/contract-activation.test.ts`.

Dev2 owns the real contract/asset orchestrator: agree this proposed port before using it, or call the existing engine transaction adapter from Dev2's own orchestrator. Do not deploy both as competing activation paths. Passing mock tests is not evidence of real signing or exclusive allocation integration.

## HTTP handlers ready for integration

`createEngineHttpHandlers({ db, resolvePrincipal, loadTaxRules })` in `http.ts` supplies Request/Response handlers using the existing API envelope. The trusted resolver returns `{actorId, role:'operator'}` or `{actorId, role:'customer', customerId}`, or null. It must verify authentication and enforce mutation CSRF/origin policy. Never implement it by trusting a body field or the development customer cookie.

Proposed registration (not live routes yet):

| Handler    | Route                                 | Access                      |
| ---------- | ------------------------------------- | --------------------------- |
| `lease`    | GET `/api/leases/[leaseId]`           | Operator or owning customer |
| `schedule` | GET `/api/leases/[leaseId]/schedule`  | Operator or owning customer |
| `invoices` | GET `/api/leases/[leaseId]/invoices`  | Operator or owning customer |
| `invoice`  | GET `/api/invoices/[invoiceId]`       | Operator or owning customer |
| `issue`    | POST `/api/leases/[leaseId]/invoices` | Operator only               |

Contexts use awaited params promises. POST accepts only `{periodIndex}` and an `Idempotency-Key` header; actor comes from the trusted resolver, tax from the server provider and price from stored signed terms. Responses use200 for both initial successful issuance and exact replay. Missing auth→401; wrong owner/role→403; absent resource→404; duplicate/conflicting command→409; request/schema errors→400; tax configuration error→503; unexpected errors→generic500. Do not use these handlers as contract activation/completion routes: those require the contract owner's audited orchestrator.

Test with `npm test -- src/server/lease-engine/http.test.ts`. Seven tests cover access isolation, issuance/replay, rejected spoofed money/tax/actor fields, safe failures and server-derived audit actor. Factory tests use real temporary SQLite with injected trusted principals. No default auth adapter or public endpoint has been enabled.

## Real contract and UI connection

`real-contract.ts` connects Dev2's actual Contract/Application models. The signing callback shares the same audited tx, validates the signed reference, creates an engine lease and unique physical `EngineAllocation`, and clears shopping-reservation expiry. `activateExistingContract()` idempotently handles earlier signed records. Contract status is projected from the associated engine state; signed terms remain immutable. Completion retains allocation until an agreed circular readiness/ownership-transfer adapter releases it.

Engine read/schedule/invoice routes are now registered with `demo-access.ts`: development mode only, selected-customer ownership checks, same-origin mutations. Signing uses that development boundary too. The customer cookie is deliberately not accepted as production authentication. Account panels display persisted invoices, generate the first3 scheduled rent invoices, and execute explicit contractual end-date completion for the demo. No payment status or physical return is fabricated.

The real integration is tested in `real-contract.test.ts`; demo access in `demo-access.test.ts`. Production auth, credits/payments, physical returns/refurbishment and second-life allocation release are still separate work.
