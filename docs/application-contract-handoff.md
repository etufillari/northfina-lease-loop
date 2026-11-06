# Application to signed contract handoff

The application service owns eligibility and signing. The lease engine consumes
only the immutable `LeaseTerms` returned by the contract endpoint.

Payment terms use the Developer 1 handoff convention of 14 calendar days.
Monthly rent is integer euro cents and is calculated once from the price-list
version on the offer. Signing never reads a current catalogue price.

## Fixture

```json
{
  "applicationId": "application-aino-1",
  "customerId": "cust-aino",
  "assetId": "ebike-003",
  "startDate": "2026-11-05",
  "termMonths": 36,
  "monthlyNetCents": 10730,
  "paymentDueDays": 14,
  "priceListVersion": 1,
  "status": "APPROVED"
}
```

## Example requests and responses

Submit the offer:

```bash
curl -X POST http://localhost:3000/api/applications \
  -H 'content-type: application/json' \
  -d '{
    "applicationId": "application-aino-1",
    "customerId": "cust-aino",
    "assetId": "ebike-003",
    "startDate": "2026-11-05",
    "termMonths": 36,
    "downPaymentCents": 0,
    "priceListVersion": 1,
    "offerExpiresOn": "2026-11-06",
    "actor": "dev2"
  }'
```

The response is an API success envelope containing an `APPROVED` application
with `monthlyNetCents: 10730` and `paymentDueDays: 14`.

Sign only with the approved applicant identity:

```bash
curl -X POST http://localhost:3000/api/applications/application-aino-1/sign \
  -H 'content-type: application/json' \
  -d '{
    "contractId": "contract-aino-1",
    "signerId": "cust-aino",
    "actor": "dev2"
  }'
```

The contract response contains this engine input:

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

`GET /api/applications/{id}` and `GET /api/contracts/{id}` read the persisted
rows after reload. Rejected and manual-review applications are stored with
their reason but cannot be signed. Invalid or expired offers and unavailable
assets return safe API errors. Signing, asset allocation, application update,
contract creation and audit logging use one transaction.

## Remaining gaps

- Production authentication and a separate authorized-signer identity model are
  not part of the starter application; the demo uses the customer ID as the
  signer identity.
- Lease activation/invoice persistence remains Developer 1's boundary. The
  returned `LeaseTerms` is ready for the existing engine.

## Local engine integration (6 November)

`signContract()` now accepts an optional transaction callback. The signing route uses `signAndActivateContract()` to create the engine lease and exclusive `EngineAllocation` in the SAME `withAudit()` transaction as signing and asset reservation. Any callback/audit failure rolls everything back. Reservation expiry is cleared for signed contracts.

The signing endpoint now requires the development selected customer to match signerId, a same-origin browser request, and development mode. For manual local curl demos, add `Cookie: lease-loop-active-user=cust-aino` and `Origin: http://localhost:3000` (matching the actual host/port). This development adapter is not production authentication.

Account leases use actual engine state; no invoice-paid status is fabricated. Existing signed contracts have a guarded activation action. The account shows persisted invoices and development-only controls for first3 periods and contractual end-date completion. Completion retains allocation pending physical return.
