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
- ** Intentional schema pass-throughs:** `customersFileSchema` does not validate Finnish business ID (`business_id`) check digits, and `refurbishmentCostsSchema` leaves `when` conditions as descriptive strings; interpreting and validating those rules belongs to `domain`.
- **Known limitation:** `loadDataFile` reads and parses JSON from disk on each invocation without in-memory caching.
