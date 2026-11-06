# Lease Loop implementation plan

## Problem and approach

Implement the complete catalogue-to-second-life Spine from `CHALLENGE.md`,
prioritising VAT-aware price locking, integer-cent invoice/calendar handling,
second-life refurbishment/matching with passports, and a dealer dashboard for
upcoming returns. Divide ownership into three feature branches with explicit
file boundaries and stable domain/API contracts so the work is easy to merge.

## Three-person work split

Use three branches. Agree on shared IDs, ISO dates, integer cents, API
envelopes, audit action names, and Prisma relation names before coding. Avoid
editing the same page, route, translation key, or Prisma migration in parallel.

### Person 1 — Pricing, contracts, and invoices

- Own `src/domain/pricing.ts`, `src/domain/vat.ts`,
  `src/domain/invoicing.ts` and adjacent tests.
- Add quote, contract, and invoice Prisma models and server services under
  `src/server/`; expose quote, contract-signing, and invoice APIs.
- Implement dated list-price selection, coefficient bands, integer-cent rent and
  buyout, immutable quote snapshots, invoice-date VAT, calendar-safe due dates,
  and rounding reconciliation.
- Publish stable results for the other branches: `QuoteBreakdown`,
  `ContractSnapshot`, `Invoice`, and structured reason codes.
- Own scenarios 1–4 and all pricing/VAT/calendar boundary tests.

### Person 2 — Applications and customer experience

- Own `src/domain/application.ts` and `src/domain/question-flow.ts` with tests,
  plus application persistence/API code under `src/server/`.
- Implement data-driven question targeting, eligibility decisions, explainable
  reasons, and answer invalidation after edits.
- Build customer components/routes in separate files under
  `src/app/[locale]/` and `src/components/`: quote selection, application,
  contract/invoice timeline, and end-of-term choice UI. Consume Person 1's
  APIs rather than duplicating calculations.
- Own customer translation keys in a prefixed namespace across all four locales.
- Test too-young, company-signatory, large-ticket/manual-review, and happy-path
  application scenarios.

#### Person 2 implementation sequence

1. Define typed application state and question-flow result contracts without
   depending on Prisma or Person 1's implementation.
2. Implement and test question targeting from `ask_when`, including deal
   fields and earlier answers.
3. Implement answer pruning when a changed answer makes later questions
   irrelevant, plus blocking-question evaluation.
4. Implement eligibility decisions and Finnish business-ID validation using
   explicit, explainable reason codes.
5. Add application API persistence through the shared response envelope and
   audit conventions.
6. Build the customer quote/application/contract timeline components as
   consumers of Person 1's APIs.
7. Add localized customer strings in all four locales and verify the selected
   challenge scenarios.

### Person 3 — Second life and dealer operations

- Own `src/domain/second-life.ts`, `src/domain/end-of-term.ts`, and
  `src/domain/passport.ts` with tests.
- Add return/refurbishment/life-history persistence and APIs under
  `src/server/`; route every state change through `withAudit()`.
- Implement residual value, refurbishment cost/condition, waiting-list
  eligibility and deterministic tie-breaking, next-life pricing through Person
  1's quote service, and append-only asset passports.
- Build separate dealer components/routes for “returns next month,”
  refurbishment decisions, matching, and passport history.
- Own dashboard translation keys across all four locales and tests for
  `ebike-007` (wait-02 vs wait-13) and `ebike-008` multi-life history.

### Merge and integration sequence

1. Person 1 lands shared schema and quote/contract/invoice service contracts.
2. Persons 2 and 3 build against those contracts in separate files; each
   creates at most one announced Prisma migration if additional tables are
   needed.
3. A final integrator wires navigation, shared locale-key validation, seed/demo
   records, and the end-to-end happy path without moving business logic into
   pages or routes.
4. Run the scenario matrix and `npm run check:all` after merging; never bypass
   hooks with `--no-verify`.

## Shared acceptance checklist

- The full Spine works for the Aino/e-bike happy path.
- Price list v1/v2 changes never mutate a signed contract; VAT changes by
  invoice date and the UI explains the difference.
- Invoice dates cover 31 January, February, leap years, and exact cent totals.
- Applications produce approve/decline/manual-review decisions with reasons.
- Returned assets can be refurbished, matched, re-priced, re-leased, and shown
  with a complete passport.
- The dealer dashboard identifies contracts ending in a selected month.
- All business logic is pure and tested; writes use `withAudit()`; UI strings
  exist in `en`, `fi`, `sv`, and `et`.

## Tracking todos

1. Establish shared data/API/Prisma contracts and scenario acceptance criteria.
2. Person 1: implement pricing, VAT, invoices, quote snapshots, and contracts.
3. Person 2: implement application rules and customer-facing flows.
4. Person 3: implement end-of-term, second-life, passports, and dealer dashboard.
5. Integrate navigation, seed data, localized strings, and API composition.
6. Run targeted scenario tests, then `npm run check:all` and a clean-db demo.

## Notes

- Money stays integer euro cents; VAT is selected on each invoice date while
  net rent and buyout remain locked in the signed contract snapshot.
- Domain functions receive dates and data as arguments and contain no I/O,
  clock, randomness, or framework imports.
- Optional follow-up work after the selected scope is stable: early-exit
  fairness, broader explain-my-price comparison, and circular CO2 reporting.
