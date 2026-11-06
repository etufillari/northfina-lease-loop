# Shared instructions for every teammate's AI assistant

Paste this into your assistant setup, or tell it: “Read AGENTS.md and docs/TEAM-AI-RULES.md before making changes.” These rules supplement AGENTS.md and RULES.md.

## Current ownership override

On6 November the project lead explicitly assumed **Dev1 + Dev3 and all remaining lifecycle integration** because Dev3 is unavailable. The lead may implement circular rules/UI and necessary contract joins. Other agents still use the role boundaries below; prefer the existing implementations and coordinate overlapping teammate branches.

## Set your scope first

At the start of a session, tell the assistant which role you own. The project lead/user is **Developer 1 — lease engine**. Teammates take Developer 2 or 3 according to their existing work. See the [role checklists](03-TEAM-EXECUTION-AND-TASK-BREAKDOWN.md).

- **Developer 1 — Engine:** `src/domain/lease-engine/`; lease state, calendar, VAT, invoices and later engine server adapters. Do not rebuild catalogue pricing, applications or return workflows.
- **Developer 2 — Spine:** catalogue/pricing, applications, eligibility and signed contracts. Provide the engine with signed `LeaseTerms`; do not create a second invoice or calendar engine.
- **Developer 3 — Circular/UI:** returns, inspection, refurbishment, second-life workflow and UI integration. Consume engine outputs; do not reproduce billing rules in components.

Existing file authors keep ownership. Role labels are responsibilities, not assigned teammate names. Read current code and coordinate if a feature is already being built.

## Before editing

1. Check `git status` and pull latest changes safely. Preserve local edits; never reset, overwrite or delete a teammate's work to resolve a conflict.
2. Read the code you will use. Prefer existing helpers and types over duplicate implementations.
3. Stay inside your scope. For cross-module work, agree the input/output with its owner first; use a small mock while waiting.
4. Coordinate edits to `prisma/schema.prisma`, shared types, package files and message JSONs. One person generates a migration at a time.

## Integration rules

- Engine handoff is `LeaseTerms` in `src/domain/lease-engine/types.ts`; public functions are documented in `docs/01-SYSTEM-ARCHITECTURE-AND-CONTRACTS.md`.
- Changing a consumed type or money/date behavior requires affected owners to agree and update tests/mocks together. Do not silently rename fields or loosen types with `any`.
- Signed net rent is immutable. Invoice tax uses invoice date. Keep dates explicit and money integer cents.
- Pure engine results are calculations, not proof of persistence, eligibility, signing or availability.
- Asset IDs survive reuse; contracts and leases get new identities.

## Repository rules still apply

- No product AI/ML/LLM integration.
- Rules in pure `src/domain/` functions, with colocated Vitest edge tests. No database, network, clock or randomness there.
- Every data change uses `withAudit()` and its `tx` for all writes.
- Routes use `ok()/fail()/handleRoute()`; never expose raw exceptions.
- Schema changes use Prisma migration generation, never handwritten SQL.
- UI strings in all four message files; files under600 lines.
- Run focused tests and `npm run check:all`. Report failures honestly; do not bypass hooks or weaken checks.
- Conventional commits, small branches, owner review. Do not push unrelated work or modify another module just to make your task easier.

When handing off, state changed files, public inputs/outputs, tests run and remaining gaps. Keep the explanation short.
