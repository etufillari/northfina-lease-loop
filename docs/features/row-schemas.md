# Row schemas: the rules a stored row must follow

## What it does

Quotes, contracts, invoice schedules, applications and audit entries are parsed by their Zod write schema right before the write, so a negative amount, a day that does not exist, a gross that is not net + VAT or a rent that does not follow from the price never reaches the database; a row that breaks its schema is answered with a generic 500, not a 400. A test reads `prisma/schema.prisma` and fails when a guarded model has a column without a rule, or when a column comment lists values its Zod enum does not have.

## The rule

SQLite stores these columns as plain TEXT and INTEGER: it has no enums and no CHECK constraints here, and this repo writes no migration SQL by hand. The practice repo held the same rules as named CHECKs in Postgres (`Invoice_gross_is_net_plus_vat`); here the write schema is the only guard (D27).

The server parses with `parseRow(table, schema, row)` (`src/server/row-rules.ts`). A row that breaks its schema is a bug in our code, not a bad request, so it throws a `RowRuleError`, never a `ZodError`: the client gets `500 INTERNAL_ERROR` and the issues go to the server log only. A `*_json` column is read back with `parseStoredJson` the same way.

**Not yet guarded:** `AssetEvent` rows (parsed by `appendAssetEventSchema` before the create, but not by a row schema), `Asset` status changes (the status alone is parsed, D23), `payInvoice`'s update (`status`, `paid_on`), and the `AuditLog` row itself (its entry is parsed, the row is built from it).

On the worked example (card 1: `ebike-003`, 36 months, no down payment, 5 Nov 2026), a quote row passes only when:

| Column                 | Rule                                                  | Card 1                                          |
| ---------------------- | ----------------------------------------------------- | ----------------------------------------------- |
| `financed_cents`       | list price × quantity − down payment                  | 389 000 × 1 − 0 = **389 000**                   |
| `monthly_net_cents`    | financed × factor in millionths, rounded half up (D1) | 389 000 × 27 584 / 10⁶ = 10 730.18 → **10 730** |
| `valid_until`          | quote day + 14 days (D7)                              | 2026-11-05 + 14 = **2026-11-19**                |
| every `_cents`         | a whole number, never negative                        |                                                 |
| `vat_rate_bp_at_quote` | 0 to 10 000 basis points                              | **2550**                                        |

Its first rent invoice passes only when VAT is the net × rate rounded half up and gross is net + VAT: 10 730 × 25.5 % = 2 736.15 → **2 736**, gross **13 466**. In January 2027 (card 3's rule) it is 10 730 × 26 % = 2 789.8 → **2 790**, gross **13 520**. A rent invoice has its period; a down payment, buyout or early-exit invoice has none; only a paid invoice has a paid day.

A contract holds the quote's money rules, starts on or after signing, ends on the last day of the term (card 1: **2029-11-04**; card 4 from 31 Jan 2026: **2029-01-30**), and has `ended_on` exactly when it is no longer `active`. A return assessment keeps the returned condition unless it refurbishes, and refurbishing never makes an item worse. Application reasons are `{ code, params }` with a snake_case code, never a sentence (team rule 6).

Card 7's rent lands on an exact half cent and the schema accepts only the rounded-up value: 12 500 000 × 0.021763 = 272 037.5 → **272 038**.

## Decisions

- D27: the row schemas and the schema-reading test.
- D23: the server function that writes parses, not the route.
- D1, D4, D5, D7, D8: the rounding, the term's last day, the down payment invoice, the 14-day quote, the quantity.
- D28 (proposed, depends on D8): one next lease per lease.
- D29: one active contract per asset, the guarded write built by the contract slice.

## Pure functions

| Function or schema                 | Input → output                                                                        |
| ---------------------------------- | ------------------------------------------------------------------------------------- |
| `quoteRowSchema`                   | the `Quote` columns → the same row, or issues naming the column                       |
| `contractRowSchema`                | the `Contract` columns → the row, or issues                                           |
| `invoiceRowSchema`                 | the `Invoice` columns → the row, or issues                                            |
| `applicationRowSchema`             | the `Application` columns (JSON as text) → the row, or issues                         |
| `applicationDecisionUpdateSchema`  | the columns a manual review changes → the update, or issues                           |
| `returnAssessmentRowSchema`        | the `ReturnAssessment` columns → the row, or issues                                   |
| `assetUsageSchema`, `usageUnitFor` | category, unit and count → the usage, or an issue when the unit is another category's |
| `auditEntrySchema`                 | an audit entry → the entry; `action` is `<entity>.<verb>`, `entityType` a known kind  |
| `checkLockedPrice(row, ctx)`       | the frozen price numbers → an issue for the first one that does not follow            |
| `jsonText(schema)`                 | a `*_json` column → checked on write: JSON text of the expected shape                 |
| `conditionAtLeastAsGood(a, b)`     | two conditions → true when `a` is `b` or better                                       |

## Files

- `src/domain/rows/`: `fields.ts` (the shared fields, `ON_VALID_FIELDS`), `locked-price.ts`, `quote.ts`, `contract.ts`, `invoice.ts`, `application.ts`, `return-assessment.ts`, `asset-usage.ts`, `audit-entry.ts`.
- `src/server/row-rules.ts`: `parseRow`, `parseStoredJson`, `RowRuleError` (the server side, not pure).
- Wired in: `src/server/quotes.ts` (`createQuote`), `src/server/contracts.ts` (signing), `src/server/invoices.ts` (`writeSchedule`), `src/server/applications.ts` (create, decide, and the JSON read back), `src/server/audit.ts` (`withAudit` checks the entry before the work runs). `src/domain/events.ts` takes the bounded VAT rate.
- `tests/schema-columns.test.ts`, `tests/helpers/row-examples.ts`.

## Tests that pin the numbers

- `src/domain/rows/quote.test.ts`: "accepts the worked example: 389 000 financed, factor 0.027584, rent 10 730"; "refuses a rent that is not the financed amount × the factor …".
- `src/domain/rows/invoice.test.ts`: "accepts card 1's first rent: 10 730 + 2 736 = 13 466"; "takes the January 2027 rate on its own line (card 3) …".
- `src/domain/rows/contract.test.ts`: "accepts card 1 …"; "clamps the end like the invoices: from 31 Jan 2026 … (card 4)".
- `src/domain/rows/locked-price.test.ts`: "passes card 7 … 272 037.5 → 272 038".
- `src/server/row-rules.test.ts`: "becomes a generic 500 for the client, with no column in the body".
- `tests/schema-columns.test.ts`: every column of a guarded model has a rule; every `_cents` column refuses −1 and 0.5; every listed comment equals its enum.

## Open questions

- The contract number is `LL-<signing day>-<id tail>` (`src/domain/contracts/number.ts`); the schema only bounds its length, so the format stays the contract slice's.
- D28 needs the contract slice's migration and the fleet decision (D8, issue #13).
- `AssetEvent.details_json` is still read as `unknown`; a schema per event kind belongs to the passport's owner, and would bring `AssetEvent` into `tests/schema-columns.test.ts`.
