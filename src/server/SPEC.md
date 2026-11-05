---
id: server
type: module-design
status: active
title: Server Persistence, Audit Trail, and API Envelope
parent: architecture
depends-on: [data]
---

## Responsibility

Owns SQLite database access (`db.ts`, `prisma-client.ts`, `prisma/schema.prisma`), transactional audit logging (`audit.ts`), persistent entity repositories (`assets.ts`), the HTTP response envelope (`api-response.ts`), and the server-side clock boundary (`today.ts`).

- **Database and repositories:** Manages the singleton Prisma SQLite client (`db`) and maps between flat SQLite columns (`usage_unit`, `usage_value`) and the domain/data-pack `Asset` shape (`toAsset`, `toAssetRowData`, `listAssets`, `changeAssetStatus`, `seedAssets`).
- **Transactional audit trail:** `withAudit(db, entry, work)` executes `work(tx)` and inserts an `AuditLog` record (`actor`, `action`, `entity_type`, `entity_id`, `details_json`) inside a single `db.$transaction` call.
- **API response envelope:** `handleRoute`, `ok`, `fail`, `ApiError`, and `readJsonBody` standardize all HTTP JSON responses, translate `ZodError` to `400 VALIDATION_ERROR`, and mask unexpected server errors behind `500 INTERNAL_ERROR`.
- **Clock boundary:** `todayIso` formats the current `Date` in `Europe/Helsinki` as `YYYY-MM-DD` so callers can pass a deterministic date string into `domain`.

## Boundary

- **Allowed imports:** `@/generated/prisma/client`, `@prisma/adapter-better-sqlite3`, `data` (`@/data/schemas`), and `zod`.
- **Forbidden reaches:** Must not import UI components or route files (`@/app/*`, `@/components/*`). Callers inside `withAudit` must perform every write through the transaction client `tx`, never the root `db` client.
- **Known limitations:**
  - `prisma/schema.prisma` currently defines only `Asset` and `AuditLog`; models for quotes, contracts, invoices, and second-life passports are not yet migrated.
  - Mutations trust the caller-supplied `actor` string because the starter has no authentication layer.
