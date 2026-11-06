---
id: data
type: module-design
status: active
title: Data Pack Schemas and Loaders
parent: architecture
---

## Responsibility

Owns the runtime validation contracts (`src/data/schemas.ts`) and server-side disk loaders (`src/data/load.ts`) for the ten JSON datasets in `data/`.

- **Canonical domain types and invariants:** Defines shared primitives (`isoDateSchema`, `centsSchema`, `assetCategorySchema`, `assetConditionSchema`, `assetStatusSchema`, `usageUnitSchema`) and dataset-specific structural invariants, including non-overlapping date ranges in `priceListsFileSchema` and contiguous 1-cent band boundaries (`previous.max_financed_cents + 1`) in `coefficientTableSchema`.
- **Fail-fast disk loading:** `loadDataFile` reads `data/<file>.json` from disk and parses it through its Zod schema so malformed reference data fails immediately at the boundary rather than inside domain calculations.

## Boundary

- `src/data/schemas.ts` is pure (`zod` only) and may be imported by any module (`domain`, `server`, `app`).
- `src/data/load.ts` performs filesystem I/O (`node:fs/promises`, `node:path`) and may only be imported by server-side code (`app` server components, route handlers, or `server`); importing `src/data/load.ts` from `domain` is forbidden.
- ** Intentional schema pass-throughs:** `customersFileSchema` does not validate Finnish business ID (`business_id`) check digits, and `refurbishmentCostsSchema` leaves `when` conditions as descriptive strings; validating business IDs belongs to `domain` (`question-flow/`). Refurbishment is not in the current plan, so the `when` strings are not interpreted yet.
- **Units stay as in the data pack:** Schemas keep percentages (`25.5`) and decimal factors (`0.027584`). `src/server/reference-rows.ts` converts them to integer basis points (`*_bp`) and parts per million (`*_ppm`) when seeding SQLite, `src/server/reference-read.ts` converts them back into the validated schema shapes when reading from SQLite, and `src/domain/early-exit.ts` converts annual interest rates to basis points for exact `BigInt` discounting.
- **Status vocabularies:** `assetStatusSchema` (`available | reserved | leased | returned | sold`) validates asset statuses across `src/data/schemas.ts`, `prisma/schema.prisma`, and `src/server/assets.ts`.
- **Known limitation:** `loadDataFile` reads and parses JSON from disk without in-memory caching when used by `prisma/seed.ts` or as the unseeded test fallback in `src/server/reference-read.ts`.
