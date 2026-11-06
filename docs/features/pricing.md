# Pricing and quotes

Spine steps 1 and 2 of `CHALLENGE.md`, smart problem 6 ("Explain my price") and scenario cards 1, 2, 6 and 7.

## What it does

The price page shows what an item costs a month for any term and down payment, line by line from the list price to the total cost, and compares the terms the item may be offered side by side. "Apply at this price" freezes that price for 14 days at its date and price-list version and opens the application, so a later price list never changes it.

In detail:

- **The price page** `/[locale]/assets/[id]`: the asset, a term slider over the terms the item may be offered (the table's 12/24/36/48 under the category's cap, D43: a laptop stops at 36, with a note saying so), a down payment typed as an exact amount or set with its slider (0 to the price, in steps of 1 % of the price rounded to whole euros; the box takes any amount to the cent, read with `parseEurosToCents`) Every item is unique, so the page prices one item and has no quantity field (D8). The monthly price updates live from `GET /api/quotes/preview`; the browser never computes a price.
- **The breakdown** ("How your price is made"), as three short sums that each end on the number the next starts from: (1) what we finance: the price of the item minus what you pay at the start; (2) your monthly payment: the amount financed × the share paid each month, plus VAT; (3) what it costs in total: the down payment with VAT plus the term's payments, then the buyout with VAT for the total if you keep it. The band letter and the price-list version are left out of the customer's view (the stored quote and the contract still show the version); the factor stays, written for the customer as "Paid each month · 2.7584 %, a share of what we finance" (the factor in millionths ÷ 10 000, all four decimals kept so 3 890 € × 2.7584 % gives the page's 107.30 €), never as a "rate", with one line saying the percentage already includes the interest. The contract page and the staff views keep "band B · factor 0.027584".
- **The term comparison**: the same choices priced at every allowed term, side by side, with the terms that cannot be priced and why. A term over the category's cap is not a row at all.
- **The stored quote** (D7, revised): "Apply at this price" stores a `Quote` row priced on the request's day, valid 14 days, with an audit row, and opens the application (`/[locale]/apply/[quoteId]`, the question-flow slice's page), which shows "Price locked until" its last valid day while the quote is valid. `?quote=<id>` on the price page still shows a stored quote with a notice when a cheaper list is live today (card 2), but nothing links to it any more.
- **The catalogue's offer** (`financeOffer`): the limits apply to the amount financed, not to the item. An item above the highest band is offered with the down payment that leaves exactly the maximum to finance: `farm-006` at 260 000 € gets "with 10 000 € down", financed 250 000 € in band D; its price page opens with that down payment and a notice saying why. An item below the lowest band is not leasable on that price list (D78): `ebike-010` at 289 € on list 1 (5 Nov) shows "Not leasable on this price list" on its card and a notice with the price and the 300 € minimum on its page, and a quote is refused with `below_minimum`; on list 2 (6 Nov) it is 303 €, band A.
- **The page:** the item and the price panel side by side from 768 px; the tag shows the monthly price, the total for the term and the buyout with VAT; the breakdown and the term comparison open on click, the comparison leading with the monthly price.
- **Refusals are codes with params** (rule 6): `invalid_down_payment`, `unknown_term`, `unknown_asset`, `no_price_list_on_date`, `down_payment_too_high`, `below_minimum`, `above_maximum`, `no_vat_rate_on_date`, and from the stored quote `asset_not_available`. The page writes them from `pricing.refusal.*` in the visitor's language, with amounts formatted as euros.

## The rule

```text
list price       = net list price of the item on the day                      (price list in force that day; one item, D8)
financed         = list price − down payment                                  (D8; down payment < list price)
band, factor     = coefficient table row for the financed amount, column for the term
monthly net      = financed × factorMillionths / 1 000 000, rounded half up   (D1, applyMillionths)
monthly VAT      = monthly net × rate in basis points / 10 000, half up        (D1, rounded from the net, per line)
monthly gross    = monthly net + monthly VAT
buyout           = financed × buyout % of the term, half up                     (15 % at 36 months)
down, buyout VAT = down payment, buyout × the same rate, half up, per line        (like invoice 0 and the buyout invoice)
total if return  = gross down payment + term × monthly gross                    (D6)
total if buy     = total if return + gross buyout                               (D6)
```

The VAT in the totals is the quote day's rate and is labelled an estimate: VAT is charged at each invoice's date (D2), so the fictional 26 % from 1 Jan 2027 moves the later rents of a lease that crosses it. The down payment and the buyout are listed net (as the data pack gives them) with their with-VAT amount beside them, and the totals use the with-VAT amounts, so a total is what the invoices add up to while the rate stays the same.

### The term cap per category (D43)

`data/term-limits.json` (the team's rule, beside the organiser's pack) caps the term per category: e-bike 48, laptop 36, farm machine 48. The terms an item may be offered are the coefficient table's terms up to the cap, in order (`allowedTerms`): a cap between two terms rounds down to the terms the table has, and a cap below the shortest term leaves none. `priceQuote` checks the cap after the term and the asset and before the money, so a laptop at 48 months is refused with `term_over_category_max` and the params `{ category: 'laptop', termMonths: 48, maxTermMonths: 36 }`, which the page writes as "Laptops are leased for at most 36 months; 48 months is over that." The slider and the comparison only show the allowed terms, and the data pack's assets give each item its category.

Worked on the cards: `laptop-004` (card 2) at 36 months still prices at 9 627 on list v1; at 48 months it is refused. `farm-002` (card 7) at 48 months still prices at 272 038, and the `ebike-004` of card 6 keeps every term. No scenario card leases a laptop beyond 36 months, so no card is refused. The limits and the assets are required fields of `PricingData`, so no caller can price without the cap: `loadPricingData()` loads them for the app and the scenario harness (`fixtures.ts`) passes them from the pack, so every card runs under the cap. The refusal names the longest term the table offers under the cap (a cap of 40 would still say "at most 36"); the page shows one allowed term as a line instead of a slider, and says when a category has no term at all.

### Card 1, line by line (`ebike-003`, 36 months, no down payment, 5 Nov 2026)

| Line                   | Number                                                     |
| ---------------------- | ---------------------------------------------------------- |
| List price (v1)        | 389 000                                                    |
| Financed               | 389 000 − 0 = 389 000 → band B                             |
| Factor (B, 36)         | 0.027584 → 27 584 millionths                               |
| Monthly net            | 389 000 × 27 584 / 10⁶ = 10 730.18 → **10 730**            |
| VAT 25.5 %             | 10 730 × 2550 / 10⁴ = 2 736.15 → **2 736**                 |
| Monthly gross          | **13 466**                                                 |
| Buyout (15 %)          | **58 350**                                                 |
| Total if you return it | 36 × 13 466 = **484 776**                                  |
| Buyout VAT             | 58 350 × 25.5 % = 14 879.25 → **14 879**; gross **73 229** |
| Total if you buy it    | 484 776 + 73 229 = **558 005**                             |

### Card 6, one bike (`ebike-004`, 36 months, 5 Nov 2026)

Every item is unique (D8, the organisers' answer of 6 Nov), so card 6 is one `ebike-004`: list price **549 000**, nothing down, financed **549 000** → band B, factor 0.027584 → 27 584 millionths; 549 000 × 27 584 / 10⁶ = 15 143.6 → **15 144** a month net, VAT 25.5 % 3 862, **19 006** gross. The card is about the signing flow: Norvi's coordinator may not sign, so the application ends `awaiting_signatory` (`docs/features/signatories.md`). At 549 000 the PEP questions (≥ 1 000 000) are not asked.

### Card 7, the half cent (`farm-002`, 48 months, 2 000 000 down)

14 500 000 − 2 000 000 = **12 500 000** financed, band D, factor 0.021763: 12 500 000 × 21 763 = 272 037 500 000, / 10⁶ = **272 037.5** exactly. Half up gives **272 038**. Floating-point euros would get this wrong; the integer division with a remainder test cannot. Buyout 8 % = **1 000 000**.

### Card 2, the locked price (`laptop-004`, band B, 36 months)

On 5 Nov 2026 list v1 is 349 000 → 9 627 a month. On 6 Nov list v2 is 321 100 → 8 857. A quote made on 5 Nov and opened on 6 Nov still shows 9 627, list v1 and its date: the stored numbers are frozen and `getQuote` rebuilds the breakdown from them without re-pricing. `quoteStatusOn` sees that v2 is live and cheaper and the page says so, with a link to price it again today.

## Decisions

- **D1** rounding: half up to the cent, once, after integer arithmetic (`applyMillionths`, `percentOf`). Implemented as proposed.
- **D6** total cost: two totals, "if you return it" and "if you buy it". Implemented as proposed.
- **D7** the quote: a stored record with date, list version, band, factor, rent, buyout and the VAT rate at quote, valid 14 days (`valid_until = quote_date + 14`, that day included). Implemented as proposed.
- **D8** one item per quote and contract: no quantity in the API or the UI, financed = list − down; the stored `quantity` column stays at 1. Decided by the organisers' answer (6 Nov), issue #13 closed.
- **D78** an item below the smallest lease is not leasable on that list (replaces D41).
- **D43** the longest term per category: `data/term-limits.json`, e-bike 48, laptop 36, farm machine 48; `term_over_category_max` before the money. Implemented as decided (issue #24).
- Not in the decisions file yet, chosen here: an asset that is not `available` (the reserved `ebike-009`) shows its price but cannot be quoted (`asset_not_available`).

## Pure functions (`src/domain/pricing/`)

```ts
priceQuote(data: PricingData, input: QuoteInput): QuoteResult
  // PricingData = { priceLists, table, vatRates, termLimits, assets }   (the limits and the assets' categories are required)
  // QuoteInput = { assetId, termMonths, downPaymentCents, isoDate }   (one item, D8)
  // QuoteResult = { ok: true; quote: QuoteBreakdown } | { ok: false; reason: QuoteRefusal }
breakdownFromFrozen(frozen: FrozenQuote): QuoteBreakdown   // the stored numbers → every derived line
compareTerms(data: PricingData, input: Omit<QuoteInput, 'termMonths'>): TermComparison
quoteStatusOn(quote: QuoteForStatus, today: string, priceLists): QuoteStatus
termsOf(table): number[]
allowedTerms(category, table, limits): number[]       // the table's terms up to the category's cap (D43)
termAllowed(category, termMonths, table, limits): boolean
allowedTermsOf(data, assetId): number[]                // by asset id, from the data's assets; every term when the data has no limits
financeOffer(data, { assetId, termMonths, isoDate }): FinanceOffer   // standard | needs_down_payment | none (D78)
addDays(isoDay: string, days: number): string   // re-exported from src/domain/civil-days.ts, shared with invoicing
QUOTE_VALID_DAYS = 14
```

Server (`src/server/quotes.ts`): `loadPricingData()`, `createQuote(db, { assetId, termMonths, downPaymentCents, today, actor }, data?)`, `getQuote(db, id)`, `storedQuoteStatusOn(stored, today, priceLists)`, `previewQuote(data, { …, today })`.

## Files

| File                                     | What                                                                                              |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `src/domain/pricing/quote.ts`            | `priceQuote`, `breakdownFromFrozen`                                                               |
| `src/domain/pricing/compare.ts`          | `compareTerms`                                                                                    |
| `src/domain/pricing/terms.ts`            | `termsOf`, `allowedTerms`, `termAllowed`, `allowedTermsOf` (D43)                                  |
| `data/term-limits.json`                  | the team's cap per category, schema `termLimitsSchema`, loader `loadTermLimits`                   |
| `src/domain/pricing/quote-status.ts`     | `quoteStatusOn`                                                                                   |
| `src/domain/civil-days.ts`               | `addDays`, no clock, shared with invoicing                                                        |
| `src/domain/pricing/index.ts`            | the public exports and `QUOTE_VALID_DAYS`                                                         |
| `src/server/quotes.ts`                   | the stored quote, the preview                                                                     |
| `src/server/quote-schemas.ts`            | the Zod schemas of the three routes (rows in `routes.ts`)                                         |
| `src/app/api/quotes/route.ts`            | `POST /api/quotes`                                                                                |
| `src/app/api/quotes/preview/route.ts`    | `GET /api/quotes/preview` (its test: the cap through the `ok()` envelope)                         |
| `src/app/api/quotes/[id]/route.ts`       | `GET /api/quotes/[id]`                                                                            |
| `src/app/[locale]/assets/[id]/page.tsx`  | the price page and the locked quote                                                               |
| `src/components/quote-calculator.tsx`    | the sliders and the term table (client)                                                           |
| `src/components/quote-breakdown.tsx`     | the breakdown list and the refusal text (server and client)                                       |
| `src/components/quote-breakdown.test.ts` | the factor written as the monthly share: 27 584 millionths → "2.7584" (en), "2,7584" (fi, sv, et) |

## Tests that pin the numbers

| Number                                                                                                                                                                                                                     | Test                                                                                                                                                                            |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Card 1: B, 27 584, 10 730, 2 736, 13 466, 58 350, both totals                                                                                                                                                              | `quote.test.ts` "card 1"; `compare.test.ts` row 36; `quotes.test.ts` stored row                                                                                                 |
| Card 2: 349 000 → 9 627, 321 100 → 8 857, locked, v2 cheaper                                                                                                                                                               | `quote.test.ts` "card 2"; `quote-status.test.ts`; `quotes.test.ts` "getQuote, card 2"                                                                                           |
| Card 6: one `ebike-004`, 549 000, band B, 15 144                                                                                                                                                                           | `quote.test.ts` "card 6"; `quotes.test.ts` "card 6"; `card-06-who-can-sign.test.ts`                                                                                             |
| Card 7: 12 500 000, band D, 272 038, buyout 1 000 000                                                                                                                                                                      | `quote.test.ts` "card 7"                                                                                                                                                        |
| The cap: e-bike [12, 24, 36, 48], laptop [12, 24, 36], farm machine [12, 24, 36, 48]; a laptop at 48 refused, at 36 and a farm machine at 48 unchanged; only allowed rows in the comparison; the route answers the refusal | `terms.test.ts`; `quote.test.ts` "the term cap"; `compare.test.ts`; `financeable.test.ts`; `src/app/api/quotes/preview/route.test.ts`; `load.test.ts` (the file and its schema) |
| `laptop-002` A, `laptop-003` B; `ebike-010` below; `farm-006` above                                                                                                                                                        | `quote.test.ts` "the traps"                                                                                                                                                     |
| Down = price, bad term, unknown asset, no list, no VAT; a body with `quantity` is 400                                                                                                                                      | `quote.test.ts` "the traps"; `src/app/api/quotes/route.test.ts`                                                                                                                 |
| Valid until 2026-11-19, expired on the 20th, leap days                                                                                                                                                                     | `days.test.ts`, `quote-status.test.ts`                                                                                                                                          |
| Reserved `ebike-009` cannot be quoted; nothing written on refusal                                                                                                                                                          | `quotes.test.ts`                                                                                                                                                                |
| Cards 1, 2, 6, 7, the band edges and the table limits on the data pack (scenario harness)                                                                                                                                  | `src/domain/scenarios/card-01-happy-path.test.ts`, `card-02-price-lock.test.ts`, `card-06-who-can-sign.test.ts`, `card-07-big-ticket.test.ts`, `traps.test.ts`                  |
| Card 1's factor 0.027584 shown as "2.7584 %" paid each month; card 7's 0.021763 as "2.1763 %"                                                                                                                              | `src/components/quote-breakdown.test.ts`                                                                                                                                        |

## Open questions

- **D8, answered (6 Nov):** the organisers said every item is unique and card 6 is one `ebike-004`; quantities and multi-item contracts are not needed (issue #13 closed). The `quantity` column of `Quote` and `Contract` is kept at 1 rather than migrated away, and signing still refuses anything above 1 (D76) for rows stored before the answer.
- Settled in review (PR #11): the totals put VAT on the down payment and the buyout at the quote-date rate, so they match the invoices (card 7: 510 000 of VAT on the 2 000 000 down payment, 255 000 on the 1 000 000 buyout).
- **The cap and a second life (D43):** the cap bounds a first lease by the item's design life. Whether it should also bound a second or third life (a returned laptop at month 24 has 24 months of design life left, so a 36-month second lease would outrun it) is still open; PR #53 applies the same category cap to later lives (`allowedTerms` in `assess.ts`, `matchDemand`). A shorter cap could become "design life minus age", from `residual-curves.json` and the passport.
- The quote shows the totals at the quote-day VAT rate. A lease that crosses 1 Jan 2027 will invoice later months at 26 %; the invoicing slice owns that, and the quote's note says the totals are an estimate.

## Added with the catalogue page (PR #23)

- `financeOffer(data, { assetId, termMonths, isoDate }): FinanceOffer` in `src/domain/pricing/financeable.ts`: `standard` (one unit, nothing down), `needs_down_payment` (the excess over the maximum, with its quote) or `none` (the refusal). Tests: `financeable.test.ts` (the combine's 10 000 €, the kids bike refused on Thursday and priced on Friday, a refusal passed on).
- `compareTerms` rows also carry `buyoutGrossCents` (the buyout with VAT at the quote day's rate), pinned at 73 229 for card 1 in `compare.test.ts`.
