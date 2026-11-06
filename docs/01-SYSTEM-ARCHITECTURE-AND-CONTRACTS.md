# Lease Loop: essential architecture

Read [team rules](TEAM-AI-RULES.md) before editing and [next steps](03-TEAM-EXECUTION-AND-TASK-BREAKDOWN.md) for ownership.

## Keep the current app

Next.js + TypeScript, Prisma + SQLite, Zod and Vitest. One application and database. Business rules stay in `src/domain/`; persistence/API orchestration in `src/server/`; pages/components use those APIs. No folder migration or new framework.

## Three boundaries

| Owner                     | Builds                                                                               | Hands off                                                   |
| ------------------------- | ------------------------------------------------------------------------------------ | ----------------------------------------------------------- |
| Developer 1 (engine, me)  | Lease transitions, calendar, VAT, invoice calculation; later issuance and duplicates | Pure functions in `src/domain/lease-engine/`                |
| Developer 2 (spine)       | Catalogue, pricing, applications, eligibility, signed contracts                      | Signed terms for engine; contract/customer/asset references |
| Developer 3 (circular/UI) | Return, inspection, refurbishment, second-life offer, UI integration                 | Same asset ID ready for another contract                    |

These role labels describe responsibilities; confirm teammate assignment before touching shared work. Existing pricing and dev-user work stays with its current authors. Teammates can consume engine functions directly from server application code; UI should use safe server boundaries.

## Engine integration: actual first implementation

Source of truth: `src/domain/lease-engine/types.ts`.

```ts
type LeaseTerms = Readonly<{
  contractId: string;
  assetId: string;
  customerId: string;
  startDate: string; // real YYYY-MM-DD
  termMonths: 12 | 24 | 36 | 48;
  monthlyNetCents: number; // signed, locked net rent
  paymentDueDays: number; // 0–60 calendar days
}>;
```

- `calculateBillingSchedule(terms)` → monthly periods with issue/due dates and net cents.
- `calculateInvoice(terms, periodIndex, vatRates)` → rent net/VAT/gross, period and selected tax snapshot. Index starts at 1. Accepts the existing dataset `VatRate[]`.
- `transitionLease(current, command, terms, asOf)` → next state. `current=null` means no lease; commands ACTIVATE, COMPLETE, TERMINATE. States ACTIVE, COMPLETED, TERMINATED.
- Results are `{ok:true,value}` or `{ok:false,reason}`. These are internal results, not HTTP envelopes.

Contract owner constructs terms from persisted signed values. Never recompute signed rent from today's catalogue price. Contract eligibility, signed status, asset availability, authorization and concurrency are application-service checks; pure engine functions do not prove these facts.

## Essential policies

- EUR integer cents; invoice VAT uses exact integer arithmetic, half-up once per rent line.
- Monthly advance billing, full anniversary months, no proration. Start Jan31 → Feb28/29 → Mar31, using original anchor.
- Periods include start and exclude end. Issue date equals period start; due date adds agreed calendar days, including weekends. Team must confirm payment terms; 14 days is used in examples.
- Tax dataset validity includes both endpoints. Select by invoice date; missing/overlapping rules fail. The 2027 rate is fictional.
- Activation date equals agreed start. Completion at/after exclusive end. Early termination transition only at anniversary boundaries; settlement and future scheduling are not implemented yet.
- Keep asset identity through every life; new customer means new contract and lease, never a rewritten contract.

These policies are the first engine behavior, not evidence of team approval. Coordinate semantic changes with consumers before merging.

## Persistence increment

Internal persistence services now live in `src/server/lease-engine/`; see their [handoff README](../src/server/lease-engine/README.md). Engine-only activation/completion and rent invoice issuance use audited transactions, scoped request receipts and a unique `(leaseId, periodIndex)` key. The current model issues rent only; add invoice kind when supplemental charges are designed. Issued amounts never change. Contract signing, atomic asset allocation and HTTP authorization remain integration work owned at their respective boundaries.

Use existing `ok()/fail()/handleRoute()` for HTTP. The development user switcher is not authentication. Protect mutations before public deployment. Coordinate Prisma schema edits with one migration author; generate migrations via `npm run db:migrate`.
