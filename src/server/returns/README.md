# Asset returns

`receiveAssetReturn()` records a lease-linked receipt and inspection, computes
mandatory work from `data/refurbishment-costs.json`, and keeps the asset
unavailable while that work is pending. `completeRefurbishmentWork()` records
completion and evidence; only after all mandatory work is complete does it make
the asset available and release the engine allocation. Both operations audit
their writes in the same transaction.

The engine reader is injected so the service can be tested independently. Use
`createMockLeaseReader()` for fixtures; production integration uses
`createEngineLeaseReader()` to read the persisted engine lease. A lease is
returnable only in `COMPLETED` or `TERMINATED` state and when the matching
physical allocation still exists.

```ts
const leaseReader = createMockLeaseReader([
  {
    leaseId: 'lease-aino-1',
    contractId: 'contract-aino-1',
    assetId: 'ebike-003',
    status: 'COMPLETED',
  },
]);
```

## Callable demo endpoints

These routes use the repository's development-only demo lease access; they are
not production authentication endpoints.

`POST /api/leases/{leaseId}/return` requires an `Idempotency-Key` header and a
JSON inspection body:

```json
{
  "assetId": "ebike-003",
  "receivedOn": "2026-11-06",
  "condition": "fair",
  "usage": { "unit": "km", "value": 3000 }
}
```

Example response data:

```json
{
  "returnId": "generated-return-id",
  "leaseId": "lease-aino-1",
  "assetId": "ebike-003",
  "status": "REFURBISHMENT_PENDING",
  "condition": "fair",
  "usage": { "unit": "km", "value": 3000 },
  "usageReductionEvidence": null,
  "receivedOn": "2026-11-06",
  "work": [
    {
      "workId": "generated-work-id",
      "code": "condition:fair->good",
      "kind": "condition_upgrade",
      "costCents": 12000,
      "mandatory": true,
      "resetsUsage": false,
      "status": "PENDING",
      "evidenceReference": null
    }
  ],
  "requiredCostCents": 12000
}
```

Complete a work item with
`POST /api/returns/{returnId}/work/{encodedWorkCode}/complete` and body
`{"completedOn":"2026-11-07"}`. Supply `evidenceReference` when the work resets
usage. Usage readings below the asset's stored reading require
`usageReductionEvidence` on the return request.
