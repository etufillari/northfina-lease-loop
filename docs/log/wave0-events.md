# Time log: wave 0b, events, route table, OpenAPI, fast-check

Real clock, Helsinki. Agent: Opus, worktree `nostalgic-sutherland-1bb709`, base `2908278`.

| When             | What                                                                                                                                                                                                                                                              |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-11-05 17:38 | Read the brief (sections 2 and 7), `audit.ts`, `api-response.ts`, the three routes, the meta rules, the practice repo's `packages/contracts` OpenAPI generator, script and test. Started `npm ci`.                                                                |
| 17:40            | Tests first: `src/domain/events.test.ts`, then the payload schemas; `src/server/events.test.ts`, then the bus; `routes.test.ts`, `openapi.test.ts`, then the table, the generator and the script.                                                                 |
| 17:52            | `npm ci` finished (14 minutes on this disk). `npm run db:setup`, `npm install --save-dev fast-check` (4.10.2; the lockfile diff is fast-check and pure-rand only), the `openapi` script.                                                                          |
| 17:55            | The four new test files and the property test pass (50 tests). `docs/openapi.json` generated: 3 paths. README "API" and "Events" paragraphs. `npm run check:all` started.                                                                                         |
| 18:20            | `npm run check:all` green except `format:check`, which flags every file the CRLF checkout touched (`core.autocrlf=true`, no `.gitattributes`); `prettier --check . --end-of-line auto` passes. 179 tests, coverage 97.6 %, build OK.                              |
| 18:25            | Commits blocked: the worktree's `config.worktree` set `core.hooksPath` to the main checkout's raw `.husky`, so git exec'd the hook scripts directly ("Exec format error"). Set it to `.husky/_` for this worktree; the hooks then ran and passed on every commit. |

## Choices made here (not in the brief)

- **Field names are camelCase** with the unit in the name (`amountCents`, `netRentCents`, `startDate`), like `AuditEntry`; the data pack's snake_case stays in the data pack and the database.
- **The VAT rate at signing is integer basis points** (`vatRateBasisPoints: 2550` for 25.5 %), so no float crosses a slice; the data pack's `rate_percent` is converted once by the contract slice.
- **The date validator is the data pack's `isoDateSchema`** (`z.iso.date()`, a regex that also checks the day against the month and leap years), re-exported as `eventDateSchema`, not a second regex. The property test proves it over 1990–2099.
- **`UNIT_RETURNED` and `UNIT_PASSED_ON` carry a `reason`** (`end_of_term` | `early_exit`) and the reported `condition` and `usage` (`{ unit, value }`, the asset's shape), because their catalogue handler needs them; `UNIT_PASSED_ON` adds `nextCustomerId`.
- **Every payload is strict** (an unknown field is an error) and `CONTRACT_SIGNED` refuses an end date before the start date.
- **`emit` validates the payload** with the union before any handler runs; an invalid payload rejects and `withAudit` rolls back.
- **`onEvent` returns an unsubscribe function**, besides `clearHandlers()` for tests.
- **OpenAPI 3.1** with the default JSON Schema dialect (the practice repo used 3.0); `$schema` is dropped from each embedded schema. The `openapi` script runs Prettier on the file, because `format:check` covers JSON.

## Left undone

- **Line endings.** Add a `.gitattributes` with `* text=auto eol=lf` (outside this task's files) so a Windows checkout passes `format:check`; until then `format:check` fails locally on Windows (every CRLF file), not in CI.
- **Hooks in other worktrees.** A worktree whose `config.worktree` points `core.hooksPath` at the main checkout's `.husky` needs `git config --worktree core.hooksPath .husky/_`.

- **Handler registration is import-time.** A slice's handlers register when its module is imported; wave 1 must import every handler module from one place (e.g. `src/server/event-handlers.ts`) that the emitting service imports, or a handler silently does not run. Not built here because no handler exists yet.
- `routes.ts` will pass 600 lines when every slice adds its schemas: split it then into `src/server/routes/<slice>.ts` files concatenated by `routes.ts`.
- The 404 of `PATCH /api/assets/[id]/status` is in the generic `default` error response, not listed per route; add a `errors` field to the row if the judges want per-route error codes.

Closed by the wave 2 upkeep, 2026-11-05: the task is merged; every handler module is registered from `src/server/event-handlers.ts`; the wave 2 hardening owns the test-isolation helper for it (D43).
