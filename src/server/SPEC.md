---
id: server
type: module-design
status: active
title: Server Persistence, Audit Trail, and API Envelope
parent: architecture
depends-on: [data]
---

## Responsibility

Owns SQLite database access (`db.ts`, `prisma-client.ts`, `prisma/schema.prisma`), reference-data mapping, seeding, and reading (`reference-rows.ts`, `reference-seed.ts`, `reference-read.ts`), transactional audit logging (`audit.ts`), persistent entity repositories and lifecycle actions (`assets.ts`, `contracts.ts`, `reservations.ts`, `early-exit.ts`), the HTTP response envelope (`api-response.ts`), and the server-side clock boundary (`today.ts`).

- **Database, seeding, and repositories:**
  - Manages the singleton Prisma SQLite client (`db`).
  - Converts all ten reference datasets from `data/*.json` into integer-rate database rows (`reference-rows.ts`), upserts them transactionally in `seedReferenceData` (`reference-seed.ts`), and reads them back from SQLite into validated domain types in `reference-read.ts` (`readPriceLists`, `readCoefficientTable`, `readVatRates`, `readResidualCurves`, `readSecondLifeDemand`, `readQuestions`, `readCo2Factors`, falling back to `src/data/load.ts` when an unseeded test DB is used).
  - Maps between flat SQLite columns (`usage_unit`, `usage_value`, `relist_price_cents`, `first_lease_date`, `first_list_price_cents`) and the domain `Asset` shape (`toAsset`, `toAssetRowData`, `listAssets`, `listAllAssetEvents`, `changeAssetStatus`, `resolveAssetEndOfTerm`, `relistAsset`, `seedAssets` in `assets.ts`).
  - Persists full lease lifecycle records (`signContract`, `findPersistedContract` in `contracts.ts`), atomically creating `Quote`, `Application`, `Contract`, `InvoiceRow[]`, and `AssetEvent` rows while setting `Asset.status = 'leased'`.
  - Executes server-verified fair early exits (`executeEarlyExit` in `early-exit.ts`), recomputing the exit quote on the server and atomically transitioning the asset to `'sold'` or `'returned'`, updating the active `Contract` and `InvoiceRow` schedule, recording an `AssetEvent`, and logging the full breakdown in `AuditLog`.
  - Manages transactional asset reservations (`AssetReservation`, `reserveAsset`, `releaseReservation`, `expireReservation`, `completeReservation`, `getActiveReservation` in `reservations.ts`), including longer-term offers with server-computed quotation persistence and price protection tracking.
- **Transactional audit trail:** `withAudit(db, entry, work)` executes `work(tx)` and inserts an `AuditLog` record (`actor`, `action`, `entity_type`, `entity_id`, `details_json`) inside a single `db.$transaction` call (e.g. `asset.offer_created`, `asset.reserved`, `asset.reservation_extended`).
- **API response envelope:** `handleRoute`, `ok`, `fail`, `ApiError`, and `readJsonBody` standardize all HTTP JSON responses, translate `ZodError` to `400 VALIDATION_ERROR`, and mask unexpected server errors behind `500 INTERNAL_ERROR`.
- **Clock boundary:** `todayIso` formats the current `Date` in `Europe/Helsinki` as `YYYY-MM-DD` so callers can pass a deterministic date string into `domain` (the default when a request sends no `asOf`).

## Boundary

- **Allowed imports:** `@/generated/prisma/client`, `@prisma/adapter-better-sqlite3`, `data` (`@/data/schemas`, `@/data/load`), `domain` (`@/domain/*`), and `zod`.
- **Forbidden reaches:** Must not import UI components or route files (`@/app/*`, `@/components/*`). Callers inside `withAudit` must perform every write through the transaction client `tx`, never the root `db` client.
- **Known limitations:**
  - Mutations trust the caller-supplied `actor` string because the starter has no authentication layer.
  - `reference-read.ts` falls back to `src/data/load.ts` when a reference table has 0 rows so isolated unit tests that only seed `Asset` do not need to run full reference seeding.
