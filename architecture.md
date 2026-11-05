---
id: architecture
type: architecture-design
status: active
title: Lease Loop — Architecture Design
parent: goal-and-requirements
---

## Drivers

- **Explainable, repeatable financial decisions:** Every pricing, underwriting, invoicing, and second-life calculation must be deterministic and testable without a database, network, or clock.
- **Transactional auditability:** No state change to an asset, contract, or invoice may commit without a corresponding audit record in the same SQLite transaction.
- **Strict module isolation enforced by tooling:** ESLint, Vitest coverage gates, and CI scripts enforce boundaries automatically (`npm run check:all`).

## Topology and Module Boundaries

The application is a single Next.js 16 (App Router, TypeScript, React 19, Prisma 7 + SQLite) monolith partitioned into five modules under `src/`:

| Module                                         | Spec     | Role                                                                                                             | Depends on                                         |
| ---------------------------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| `src/data`                                     | `data`   | Zod schemas (`schemas.ts`) and server-side JSON loaders (`load.ts`) for the static `data/` pack                  | `zod`, `node:fs` (`load.ts` only)                  |
| `src/domain`                                   | `domain` | Pure, deterministic business rules (pricing, coefficients, eligibility, contracts, invoicing, second life)       | `data` (`schemas.ts` types only)                   |
| `src/server`                                   | `server` | Prisma SQLite client, `withAudit` transaction wrapper, HTTP response envelope, and Helsinki clock helper         | `data` (`schemas.ts`), `@/generated/prisma`, `zod` |
| `src/i18n`                                     | `i18n`   | Four-locale (`en`, `fi`, `sv`, `et`) dictionaries, string interpolation, and locale-aware date/number formatting | None (leaf module)                                 |
| `src/app` (+ `src/components`, `src/proxy.ts`) | `app`    | Next.js pages, server/client UI components, locale routing proxy, and `/api/*` route handlers                    | `data`, `domain`, `server`, `i18n`                 |

## Decisions

- **Functional core, imperative shell:** Business rules live in `domain` as pure functions taking plain values and ISO date strings (`YYYY-MM-DD`). Side effects — reading the system clock (`todayIso()`), loading JSON files (`src/data/load.ts`), and querying/mutating SQLite (`src/server/`) — happen exclusively in `server` and `app`.
- **Hybrid data storage:** Mutable business entities (`Asset`, `AuditLog`, and future `Contract` / `Invoice` models) live in SQLite via Prisma (`prisma/schema.prisma`), while immutable reference tables (`price-lists.json`, `coefficient-table.json`, `vat-rates.json`, `questions.json`, `residual-curves.json`, `refurbishment-costs.json`, `second-life-demand.json`, `co2-factors.json`, `customers.json`) are validated on read from `data/` via `data`.
- **Single-point cent rounding:** All monetary amounts are represented as non-negative integer euro cents (`centsSchema`). Whenever a percentage or factor multiplication produces fractional cents, `domain` rounds once to the nearest cent using `Math.round`.

## Invariants

- **No AI/ML in product code:** No AI, ML, or LLM packages, imports, or API keys may exist in `package.json`, `src/`, or `prisma/` (`npm run check:no-ai`).
- **Pure domain boundary:** `src/domain/**/*.ts` is forbidden by `eslint.config.mjs` from importing `node:*`, `next/*`, `react`, `@prisma/*`, `@/generated/*`, `@/server/*`, `@/data/load`, or `@/app/*`, and from calling `fetch`, `process`, `Date.now()`, `new Date()`, or `Math.random()`.
- **Mandatory transactional audit trail:** Every database mutation must execute inside `withAudit(db, entry, (tx) => ...)` using the provided `tx` client so the business write and `AuditLog` insert commit or roll back together.
- **Uniform API envelope:** Every `/api/*` handler is wrapped in `handleRoute()` and returns `{ success: true, data, meta: { timestamp } }` or `{ success: false, error: { code, message, details? }, meta: { timestamp } }`. Unhandled exceptions become generic `500 INTERNAL_ERROR` responses without leaking internals.
- **Four-locale parity:** Every UI translation key must exist in all four `src/i18n/messages/{en,fi,sv,et}.json` files (verified by `src/i18n/messages.test.ts`).
- **File size and test coverage gates:** No hand-written source file may exceed 600 lines (`npm run check:file-size`), and Vitest coverage must stay at or above 60% lines, functions, branches, and statements across `src/domain`, `src/server`, `src/data`, and `src/i18n`.

## Out of scope

- External authentication, user sessions, and role-based access control.
- Background job runners or external message queues.
