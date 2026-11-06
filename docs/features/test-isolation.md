# Test isolation

## What it does

Every database test starts from an empty database it seeds itself, and every test runs with exactly the event handlers it names, so no test passes or fails because of another test, another file's imports or the order they ran in. Three meta-rules keep it that way, and the pure domain tests run shuffled to prove they do not lean on order.

## The rule

1. **One reset.** A DB test's `beforeEach` calls `resetDb(db)`, then seeds what the test reads (`seedPack(db)`, a contract fixture). `resetDb` deletes every table in one fixed foreign-key order (children first: return assessments, invoices, asset events, contracts, applications, quotes, customers, assets, the audit log) inside one `$transaction`. No other file calls `deleteMany`.
2. **One handler set-up.** The handler registry in `src/server/events.ts` is module state; the services register the production handlers when `event-handlers.ts` is first imported, so before this a test's handlers depended on what its file happened to import (`invoice-handlers.test.ts` imported `./event-handlers`, others called `clearHandlers()` and registered their own). Now a file calls `withProductionHandlers()` (or `withHandlers(register)` for a chosen set, or `withHandlers()` for none) at its top: before each test the registry is cleared and exactly that set registered, after each test it is cleared again. Clearing first makes an import-time registration harmless (never twice).
3. **A sequence is one test.** Sign → pay → exit is one `it` with commented steps (`src/server/scenarios/card-01-08.test.ts`), or a `describe.sequential` with its fixture in `beforeAll`; never two `it`s that read each other's rows. Concurrent tests are forbidden where tests share a database file or the registry.
4. **Files in parallel, tests in order.** Each DB test file copies the migrated template into its own temp SQLite file (`createTestDb()`), and `isolate` gives each file its own module graph and so its own registry: files run in parallel safely (`fileParallelism: true`, stated in `vitest.config.ts`). Inside a file tests run in the order written. The `domain` project (`src/domain/**`, pure) runs with `sequence.shuffle`, files and tests; a failure prints its seed.

Worked example, what the reset found: `src/server/asset-events.test.ts` seeded card 10's bike once in `beforeAll`, and its "card 10: two past lives and the third, 58 kg" test only passed because the test above it had written the third life's `assessed` and `leased` rows. With `resetDb` in `beforeEach` it failed with `[[true, 24], [true, 24]]` (two lives, not three); the fix gives the passport tests their own `logThirdLife()` fixture. Card 10's numbers are unchanged: `[0, 29, 29]` kg, 58 in all.

## Decisions

**D44 (proposed, wave 2 hardening; numbered D44 in `docs/decisions.md` because #25, #32 and #33 took D37 to D43): test isolation by reset, named handlers and no concurrency.** For the upkeep session to copy into `docs/decisions.md`.

- _Chosen:_ one `resetDb(db)` in every DB test's `beforeEach` (every table, one FK order, one transaction); `withProductionHandlers()` / `withHandlers()` clearing and registering around each test; sequences as one `it`; `fileParallelism: true` with per-file database copies; `sequence.shuffle` for the pure domain tests; meta-rules for all three.
- _Chosen against:_ **a transaction per test rolled back in `afterEach`** (Prisma's interactive transactions cannot wrap the services, which open their own `withAudit` transaction, and SQLite has no nested transactions without savepoints Prisma does not expose); **a fresh database copy per test** (a copy plus a new client per test costs about a second each on Windows, roughly 15 minutes over the suite); **per-file hand-written `deleteMany` lists** (what we had: ten different lists, some kept rows other tests had changed, e.g. a sold asset left `leased`, and one hid a real order dependence); **`vi.resetModules()` to re-run `event-handlers.ts`** (it would also give `events.ts` a new registry, different from the one the services under test hold); **shuffling the DB tests** (they are already independent by the reset; shuffling them buys little and makes a failing seed harder to reproduce across 20 files).
- _Name:_ the brief named the helper `useProductionHandlers`; ESLint's `react-hooks/rules-of-hooks` refuses a `use…` call at a test file's top level, so it is `withProductionHandlers`, which also matches the file name.

## Pure functions

The helpers are test code, not domain code; their inputs and outputs:

- `resetDb(db: PrismaClient): Promise<void>`: deletes every row of every table in `RESET_ORDER`, all or nothing. Harmless on an empty database.
- `RESET_ORDER`: the nine model names, children first. Its test checks it against every `model` in `prisma/schema.prisma`, so a new table fails the test until it is added.
- `withHandlers(register = () => undefined): void`: registers a `beforeEach` (`clearHandlers()`, then `register()`) and an `afterEach` (`clearHandlers()`) in the calling scope (file or `describe`).
- `withProductionHandlers(): void`: `withHandlers(registerProductionHandlers)`.
- `registerProductionHandlers(): void`: the production wiring of `src/server/event-handlers.ts`, in its order (invoices, catalogue, passport), from the handler functions those modules export.
- `PRODUCTION_WIRING`: that wiring as data; its test parses the `onEvent` lines of the modules `event-handlers.ts` imports and fails when they differ.
- `dropAllHandlers(): void`: empties the registry inside a test that then registers its own (`passport-handlers.test.ts`).
- `tests/helpers/journey.ts`: `quoteAndApply(db, trip)`, `sign(db, applicationId, actor, day)`, `signedContract(db, trip, signOn?)`, `payRents(db, contractId, count, actor)`: the customer's path through the real services for the end-to-end card tests; nothing in it knows a card.

## Files

- `tests/helpers/reset-db.ts`, `tests/helpers/reset-db.test.ts`
- `tests/helpers/with-handlers.ts`, `tests/helpers/with-handlers.test.ts`
- `tests/helpers/journey.ts` (used by `src/server/scenarios/*.test.ts`)
- `vitest.config.ts`: `fileParallelism`, `isolate`, the `domain` (shuffled) and `server` projects
- `tests/meta-rules.test.ts`: the three rules below
- The set-up blocks of every DB test under `src/server/` and `src/app/api/audit-log/verify/route.test.ts`

## Tests that pin the numbers

- `tests/helpers/reset-db.test.ts`: `RESET_ORDER` equals the schema's models; a database with assets, customers, quotes, applications, two contracts, an asset event and audit rows is empty after one reset; two resets on an empty database are harmless.
- `tests/helpers/with-handlers.test.ts`: `PRODUCTION_WIRING` equals the `onEvent` lines of `invoice-handlers.ts` and `catalogue-handlers.ts` in `event-handlers.ts`'s import order, ending with the passport; with the production set a signing writes 36 invoices and exactly one passport entry (no double registration); a throwing handler one test adds is gone in the next; with no set a signing writes nothing else; `dropAllHandlers` empties a test's own registration.
- `tests/meta-rules.test.ts`: "no file clears a table except the resetDb helper", "no test imports event-handlers or clears the registry except through the helper" (`events.test.ts`, which tests the registry, is the one exception), "no server or scenario test runs concurrently". Each was checked against a planted `src/server/zz-plant.test.ts` (an `event-handlers` import, `clearHandlers()`, `db.invoice.deleteMany()`, `describe.concurrent`): all three rules failed naming the file and line; the plant was removed.
- The suite ran twice with different shuffle seeds (`1793911691294`, `1793911718536`), 97 files, 970 tests, green.

## Open questions

- **`src/server/event-handlers.ts` could export `registerProductionHandlers()`** (idempotent, called at import as now), so the helper calls it instead of repeating the wiring. Today the helper repeats the seven `onEvent` lines and a test pins them to the source; the server file belongs to its owners, so this is a proposal for them.
- **Seeding per test** costs a `createMany` of 30 assets and 10 customers before each DB test; the suite's wall time did not change measurably. If it grows, a seeded template per file (`createTestDb({ seeded: true })`) is the next step.
- **The DB tests are not shuffled.** If the team wants the proof there too, add `sequence.shuffle` to the `server` project; the reset should make it pass.
