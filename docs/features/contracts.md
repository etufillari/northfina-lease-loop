# Contracts: signing and the contract page

## What it does

The applicant (or admin) signs an approved application: the contract copies the stored quote's frozen numbers, takes the asset out of the catalogue and emits `CONTRACT_SIGNED`, so the invoices and the passport entry are written in the same transaction. The approved application page has the **Sign** form (issue 39): the applicant or admin picks a start day (the signing day by default, at most 12 months on, D45) and signs, and lands on the contract; once signed, the page links to the contract instead. The contract page shows the lease, the locked price with the reason it holds when a newer price list is live, and the invoices with their VAT-change line.

## The rule

`planContract` refuses, in this order: the decision is not `approved` (`application_not_approved`), the quote is past its `valid_until` on the signing day (`quote_expired`, the last day included, the same rule as `storedQuoteStatusOn`), the asset is not `available` (`asset_not_available`), the signing day is before the quote's day (`quote_not_yet_valid { quoteDate }`: the demo clock moved back, review finding 10; the application refuses it too), the start is before the signing day (`start_before_signing`) or more than 12 calendar months after it (`start_too_far` with `maxStartDate`, `addMonthsClamped(signedOn, 12)`, so a 29 February 2028 signing may start up to 28 February 2029; D45). Otherwise the contract copies the quote: list price per unit, down payment, financed amount, band, factor, monthly net, buyout, price-list version and the VAT rate at quote, and the quantity. Nothing is re-priced. The end date is the last day of the term, `termEndDate(start, months)` from `src/domain/invoicing/dates.ts`: start plus the term in months (the day clamped to a short month), minus one day. The number is `LL-` + the signing day + the last 8 characters of the application id.

The server (`signContract`) adds: the signer must be the application's customer or `admin` (`not_allowed_to_sign`); one contract per application (`already_signed`, backed by the unique `application_id`). Inside one `withAudit`: `leaseAvailableAsset` sets the asset `leased` with `updateMany where { id, status: 'available' }` and throws unless exactly one row changed, then the contract row is created and `CONTRACT_SIGNED` emitted. A lost race throws, the whole transaction rolls back (no contract, no invoices, no passport entry, no audit row) and the caller gets `asset_not_available`.

**Card 1.** Aino's `ebike-003` quote of 5 Nov 2026 (band B, factor 0.027584, net 10 730, buyout 58 350, v1) signed and started on 5 Nov 2026 for 36 months: the contract ends on 4 Nov 2029 (5 Nov 2029 − 1 day), the asset is `leased`, the passport has one `leased` entry on 5 Nov 2026, and invoicing writes 36 rents: the first due 5 Nov 2026 at 13 466 gross, the January 2027 one at 13 520 (26 %). No down payment, so no invoice 0 (D5).

**Card 2.** A `laptop-004` quote on Thu 5 Nov 2026 is on price list v1: 349 000, rent 9 627. Signed on Fri 6 Nov, when v2 is live at 321 100 (rent 8 857), the contract keeps 349 000 and 9 627 on v1, and the page reads `price_locked_from_quote { quoteDate: 2026-11-05, priceListVersion: 1, currentPriceListVersion: 2, currentMonthlyNetCents: 8857 }`: "You were quoted on 5 Nov 2026 on price list 1, so your rent is 96,27 € … Price list 2 is in force today and would price the same lease at 88,57 €. A signed contract keeps the price of its quote and is never re-priced." The explanation is computed again on every page view against that day's list, so it disappears if the lists agree again.

**Card 3** is on the page through `InvoiceTable` (the invoicing slice's component), which explains the VAT change between the December and January invoices. **Card 4**: a start on 31 Jan 2026 for 36 months ends on 30 Jan 2029; the February due dates are invoicing's.

**Only the customer signs (D88).** The admin reviews and may apply on a customer's behalf (D47) but is refused `customer_signs` at signing; the application page shows the admin a note in place of the Sign button. Signing re-reads the application's decision inside its transaction, so an application withdrawn meanwhile (D87) is refused with `application_not_approved`.

**"Price fixed on".** The contract's terms show the quote's day as "Price fixed on" instead of "Price list: Version 2"; the note under the price says the price was worked out with the prices in force that day (the list's number in brackets) and stays for the whole term, only the VAT following each invoice date.

## Decisions

- D5: invoice 0 on the signing day, written by invoicing's handler from the event's `signedOn`.
- D6: the totals with VAT stay with pricing and invoicing; the contract stores the net numbers.
- D7: signing copies the quote and never re-prices; the signing day may precede the start day; the page prints the quote day and the list version and says when a newer list is live.
- D45: the start is the signing day or a chosen later day up to one year ahead; `CHALLENGE.md` and `data/DATA.md` state no bound.
- D10: only `approved` signs; `manual_review` and `awaiting_signatory` are refused until the application slice decides them.
- D22: signing sets the asset `leased`, as the race's conditional write.
- D23: the decision, the asset status, the days and the written statuses are parsed with their Zod schemas before use; a bad value throws and nothing is written.

## Pure functions

- `planContract(input) → { ok: true, contract, event, priceLock } | { ok: false, reason: { code, params } }` (`src/domain/contracts/sign.ts`). Input: `contractId`, `applicationId`, `customerId`, `decision`, `assetStatus`, `quote` (the frozen quote with `isoDate` the quote day and `validUntil`), `quoteStatus` (from `storedQuoteStatusOn` on the signing day), `currentMonthlyNetCents` (today's list price of the same lease, or null), `signedOn`, `startDate`. The event is parsed with `contractSignedSchema`.
- `priceLockOf({ quote, quoteStatus, currentMonthlyNetCents }) → PriceLock | null`: the card 2 explanation when today's list is another version.
- `contractNumber(signedOn, applicationId) → 'LL-YYYYMMDD-XXXXXXXX'` (`src/domain/contracts/number.ts`).
- `START_MONTHS_MAX = 12` (D45).

## Files

- `src/domain/contracts/` (`sign.ts`, `number.ts`, `index.ts` and their tests)
- `src/server/contracts.ts`: `signContract(db, { applicationId, startDate?, actor }, today, data?)`, `getContractDetails(db, id, today, data?)`, `toContractView`, and the owner's reads `getContract(db, id)` and `contractCustomerId(db, id)` (wave 1 review finding 3). `GET /api/contracts/[id]`, the page and `src/server/invoices.ts` (`invoiceCustomerId`, the re-exported `contractCustomerId`) use them; both take `PrismaClient | TransactionClient`. `endContract(tx, { id, status, endedOn })` is the exit slice's way to end a lease (`docs/features/exits.md`)
- `src/server/catalogue-handlers.ts`: `leaseAvailableAsset(tx, assetId)` and `AssetNotAvailableError`. This write is the catalogue's `leased` transition (D22) for now, done in the contract slice because the catalogue has no `tx`-taking status write yet (`changeAssetStatus` opens its own transaction; wave 1 review finding 4). It parses `available` and `leased` with `assetStatusSchema` before the write (D23)
- `src/server/contract-schemas.ts`, the two rows in `src/server/routes.ts`, `docs/openapi.json`
- `src/app/api/contracts/route.ts` (`POST`, 201; 404 unknown application, 403 not the applicant, 409 already signed or asset taken, 422 the other refusals, all with the code and params in `details`)
- `src/app/api/contracts/[id]/route.ts` (`GET`, the contract's customer or admin)
- `src/app/[locale]/contracts/[id]/page.tsx`, `src/components/contract-summary.tsx`
- The Sign form on `src/app/[locale]/applications/[id]/page.tsx` (issue 39): `src/components/sign-contract-form.tsx` posts `{ applicationId, startDate? }` and goes to `/[locale]/contracts/[id]`; `src/components/sign-refusal.ts` writes a refusal from `contract.refusal.<code>` with its days as dates and a decision as its status text. The page reads the signing day once (`todayForRequest()`), uses it only for the date field's bounds (`addMonthsClamped(today, START_MONTHS_MAX)`), and finds an existing contract with the owner's read `contractIdOfApplication(db, applicationId)`. The button shows only to the applicant customer or admin; the server checks again
- The `contract.*` keys in the four message files

The race write is not a `CONTRACT_SIGNED` handler on the bus, though D22 says the event sets `leased`: the invoicing and passport tests emit `CONTRACT_SIGNED` for `ebike-003` several times on one database, and a registered handler would make their second emit fail. `signContract` calls the catalogue's function on its own `tx` before it emits, which is the same transaction and the same rollback, and a lost race stops before the other handlers write.

## Tests that pin the numbers

- `src/domain/contracts/sign.test.ts`: card 1 (end 2029-11-04, the copied numbers, the event payload), card 2 (9 627 kept, the price lock with 8 857), card 4 (end 2029-01-30), a leap-day start, every refusal with its params, the 90-day boundary, quantity 4 carried unchanged, D23 throws.
- `src/components/sign-refusal.test.ts`: every refusal code the route returns has its own message in all four languages, `start_too_far` reads "by 3 February 2027", a decision is written as its status text, an unknown code falls back to `contract.sign.error`.
- `src/server/contracts.test.ts`: `contractIdOfApplication` is null until signed, then the contract's id; card 1 against the real database (36 invoices, 13 466 and 13 520, the passport entry, the asset `leased`, one audit row naming the actor), invoice 0 on the signing day before a later start, admin signing, card 2 end to end, the last-unit race sequential and simultaneous (`Promise.all`: one wins, the other writes nothing), `already_signed`, `not_allowed_to_sign`, and every refusal leaving the counts unchanged.
- `src/server/scenarios/card-01-08.test.ts` and `card-02-07.test.ts` (wave 2 hardening): cards 1 to 4 signed after a real application through `createApplication`, the price lock of card 2 with both versions, card 3 dated 15 Sep 2026, card 4's end date and February due days, and `application_not_approved` for cards 5 (`rejected`), 6 (`awaiting_signatory`) and 7 (`manual_review`).

## Open questions

- **D8, quantity (issue #13).** Signing refuses a quantity above one with `not_enough_units` (D76), since it locks only the one asset row named by the quote; a quote still prices a fleet. N units on one row are locked as one row until D8 is decided: a fleet of four `ebike-004` takes the single `ebike-004` out of the catalogue and the other three are "to be delivered".
- **Who signs an `awaiting_signatory` application.** Signing refuses everything but `approved`; the application slice's decision route lets the named signatory approve first (D10). Whether the signatory should then also be allowed to sign the contract (today only the applicant customer or admin may, and the Sign form follows that) is open: the signatory is not a customer in the data pack.
