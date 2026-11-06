# Circular impact and the passport

## What it does

Every item has a passport: its lives across leases, with dates, months, contract and what happened between lives (assessed, refurbished, repriced). Each later life is credited with the CO2 it avoided and the money it saved (D80), per item on the passport page: both totals, each life's "29 kg CO₂e and 332,80 € saved", and a "How is this calculated?" popup holding both methods as short bullets, CO₂ and money, with that item's numbers. A past life from before our records is marked estimated: card 10's life 2 shows 332,80 € on 6 Nov and 314,80 € on 5 Nov (worked below). The totals are also on the landing page's "Why it's greener": the total CO2 saved as the big number, the total money saved under it, and the same totals per category ("… kg CO₂e and €… saved by e-bike leasing"), which add up to them. A "How is this calculated?" button under the numbers shows the method as short bullets (CO₂, then money) on hover, focus or tap (the refurbishment share read from `co2-factors.json`). The strip names no items: each item's saving is on its passport, reached from the catalogue (greyed returned and leased units link straight to theirs) (smart problem 7, problem 3's passport bonus, scenario card 10).

## The rule: the method, worked through card 10

A later life avoids the manufacturing of a new item, minus what refurbishing cost, spread over the months the item is built to last and counted for the months that life used:

```
saved = footprint × (1 − refurbishment share) × months counted ÷ design life months
months counted = min(months of the life, design life − months all earlier lives used)
```

The first life earns nothing (the item was made for it). Every life, the first included, uses up design life.

Card 10, `ebike-008` (`data/assets.json`: e-bike, `previous_lives: 2`):

| Input                      | Value                                                    | Source                                 |
| -------------------------- | -------------------------------------------------------- | -------------------------------------- |
| Manufacturing footprint    | 165 kg CO2e                                              | `data/co2-factors.json`                |
| Refurbishment share        | 12 % → net 145.2 kg per whole design life                | `data/co2-factors.json`                |
| Design life                | 120 months (1.21 kg per month of later life)             | `DESIGN_LIFE_MONTHS` (team assumption) |
| Months of the 2 past lives | 24 each, estimated (the data pack has no dates for them) | `ASSUMED_PAST_LIFE_MONTHS`             |
| Third life                 | leased on the demo day; 24-month term                    | the event log                          |

| Life       | Months | Design life used before | Saved                         |
| ---------- | ------ | ----------------------- | ----------------------------- |
| 1 (past)   | 24     | 0                       | 0 kg (first life)             |
| 2 (past)   | 24     | 24                      | 145.2 × 24 / 120 = 29.04 → 29 |
| 3 (logged) | 24     | 48                      | 145.2 × 24 / 120 = 29.04 → 29 |
| **Total**  |        |                         | 58.08 → **58 kg**             |

On the signing day the third life has 0 months and the passport shows 29 kg; the total grows as the lease runs (an open life counts its months to the demo-clock day).

**A worn-out item earns nothing more.** If `ebike-008`'s lives had already used the 120 months, a third life of any length earns 0 kg. A life longer than what is left is capped: after 48 months used, a 96-month third life counts only 72 months, 87.12 → 87 kg.

**Rounding.** Everything is computed in grams, unrounded, and rounded once, half up, to whole kg where it is shown (`gramsToKg`). An item's total is rounded from its unrounded grams; the fleet total is the sum of the rounded category rows, so the breakdown adds up.

### Money saved (D80)

In euros, from the data pack's money: a later life is credited with the share of a new item's price it used and charged what getting the item ready for it really cost:

```
money saved = new list price × months counted ÷ design life months − refurbishment cost of that life
              (never below 0; months counted as for the CO2)
```

- **New list price:** the item's net list price on the day (the price list in force, as the catalogue shows it), so the saving is in today's money and moves when a new list starts: card 10's life 2 shows 314,80 € on 5 Nov and 332,80 € on 6 Nov.
- **Refurbishment cost:** what the return assessment spent before that life (the `refurbished` event's `costCents`, from `refurbishment-costs.json`). A past life from before our records has **no record of the exact costs**, so it is charged only the costs we know were there: the steps the cost table does on every relisting (`when: "always"`: e-bike safety inspection 4 500, laptop data wipe 2 500, farm machine safety inspection 40 000). Its amount is shown as **estimated**, on the passport (per life and under the total) and on the landing page.
- **Worn out:** a life past the design life counts 0 months and saves nothing; a life whose refurbishment cost more than the use it gave saves 0, never a negative amount, and never takes away from another life.

Card 10, `ebike-008`, 188 900 on price list v2 (from 6 Nov 2026): a 24-month life is 188 900 × 24 ÷ 120 = 37 780 of a new bike's use.

| Life       | Months counted | Refurbishment                      | Saved                   |
| ---------- | -------------- | ---------------------------------- | ----------------------- |
| 1 (past)   | 0              | —                                  | 0 (first life)          |
| 2 (past)   | 24             | 4 500, estimated (inspection only) | 37 780 − 4 500 = 33 280 |
| 3 (logged) | 24             | 4 500 (card 10's assessment)       | 37 780 − 4 500 = 33 280 |
| **Total**  |                |                                    | **66 560** (665,60 €)   |

Had card 10's refurbishment cost 39 500 (a battery and the inspection), life 3 would save 0. Integer cents, one division, half up (D1); an item's total and each category row are rounded once from the exact sum, and the fleet total is the sum of the rows, so the landing page's breakdown adds up.

The e-bike's avoided car km factor is not used: the data pack's usage is a lifetime total, not per life.

### How lives come from the event log

`AssetEvent` rows are read in id order (the order they were written), never re-sorted by date, so two events on one day keep their order.

- `leased` opens a life (start = the event day, contract id from the event). A `leased` while a life is still open closes that life on the same day.
- `returned`, `bought`, `passed_on` close the open life (end = the event day, inclusive). A closing event with no open life is kept in the gap, not dropped.
- `assessed`, `refurbished`, `repriced` attach to the gap after the life they follow (`between`), or to `before` ahead of the first lease.
- Months are whole months counted like the invoice schedule: the start day to the day before the same day next month is one month; a start on the 31st clamps to the end of a shorter month.
- `passportFor` puts the `previous_lives` the data pack counts first, undated, 24 months each, marked `estimated`.

The rows are written by the handlers in `src/server/passport-handlers.ts`: `CONTRACT_SIGNED` → `leased` (on `startDate`), `UNIT_RETURNED` → `returned`, `CONTRACT_BOUGHT_OUT` → `bought`, `UNIT_PASSED_ON` → `passed_on`, inside the emitter's `withAudit` transaction.

## Decisions

Implements **D15** (`docs/decisions.md`, status: implemented as proposed) and **D80** (money saved, by the same method). To the challenge's question, "is the saving the same when the item was almost worn out?": no. A later life is credited with the share of a new item's life it replaces, so an almost worn-out item earns almost nothing and no footprint is counted twice. Crediting a whole footprint per reuse, as the data file's hint suggests, would credit a 2-month second life the same as a 10-year one.

## Pure functions

`src/domain/second-life/co2.ts` (pure):

```ts
DESIGN_LIFE_MONTHS: Record<AssetCategory, number>          // e_bike 120, laptop 48, farm_machine 144
ASSUMED_PAST_LIFE_MONTHS = 24
co2Method(factors: Co2Factors, designLifeMonths?): Co2Method
co2SavedByLife(method, { category, lifeIndex, months, monthsUsedBefore? }): number   // grams, unrounded
gramsToKg(grams: number): number                            // the one rounding rule
co2SavedForAsset(method, { category, lives: { months }[] }):
  { perLifeGrams: number[]; perLifeKg: number[]; totalGrams: number; totalKg: number }
fleetImpact(method, assets: { category, lives }[]):
  { perCategory: { category, assetsWithLaterLife, kg }[]; assetsWithLaterLife: number; totalKg: number }
countedMonths(method, life): number                          // shared with the money saved
```

`src/domain/second-life/money-saved.ts` (pure):

```ts
mandatoryRefurbishmentCents(costs, category): number  // the `always` steps
refurbishmentByLife(lives: { between }[], fallbackCents): number[]
moneySavedByLife(method, { category, lifeIndex, months, monthsUsedBefore?, newPriceCents, refurbishmentCents }): number  // cents
moneySavedForAsset(method, { category, newPriceCents: number | null, lives: { months, refurbishmentCents }[] }): { perLifeCents: number[]; totalCents: number }
fleetMoneySaved(method, assets): { perCategory: { category, cents }[]; totalCents: number }
```

`src/domain/passport.ts` (pure):

```ts
wholeMonths(start: string, endInclusive: string): number
livesFromEvents(events: PassportEvent[], asOf?: string): { before: PassportEvent[]; lives: Life[] }
passportFor(asset: Asset, events: PassportEvent[], asOf?: string): Passport
// Life = { index, start, end, contractId, months, endKind, estimated, between }
```

`src/server/asset-events.ts`:

```ts
appendAssetEvent(tx, { assetId, contractId?, kind, onDate, details? }): Promise<PassportEvent>
listAssetEvents(db, assetId): Promise<PassportEvent[]>
readPassport(db, assetId, asOf): Promise<{ asset, passport, co2, money } | null>
readFleetImpact(db, asOf): Promise<{ fleet: FleetImpact; money: FleetMoney; assets: { asset, kg }[] }>
```

`src/server/passport-handlers.ts`: `registerPassportHandlers(): () => void`, called once by `src/server/event-handlers.ts`.

## Files

- `src/domain/second-life/co2.ts`, `src/domain/second-life/money-saved.ts`, `src/domain/passport.ts` and their tests
- `src/server/asset-events.ts`, `src/server/passport-handlers.ts`, `src/server/event-handlers.ts` and tests; `tests/helpers/contract-fixture.ts`
- `src/app/api/assets/[id]/passport/route.ts` (`GET`, row in `src/server/routes.ts`, in `docs/openapi.json`)
- `src/app/[locale]/assets/[id]/passport/page.tsx`, `src/components/impact-strip.tsx` (mounted on the landing page), `src/components/passport-card.tsx` (the "Item passport" card on the price page, under the item's specs: forest green like a passport cover, a booklet icon, one line on what the passport holds)
- `passport.*` and `impact.*` keys in the four message files

## Tests that pin the numbers

- `co2.test.ts`: "an item returned after 2 of 60 months earns 2/60 of the net footprint, not the whole" (4.84 → 5 kg); "a worn-out item whose lives already used the design life earns nothing more"; "a life longer than the remaining design life is capped"; "rounds the total once, not each life"; "card 10: ebike-008, two past lives and a 24-month third life, has saved 58 kg" (`[0, 29, 29]`, 58 080 g).
- `passport.test.ts`: whole months (15 Jan → 14 Feb is one month, 31 Jan clamps), open life, two events on one day in log order, "card 10: ebike-008 shows its two past lives, undated and estimated".
- `money-saved.test.ts`: the first life saves nothing, a whole design life saves the new price minus the cost, 7 of 60 months rounded once (9 167), an almost worn-out item counts only what is left, a costlier refurbishment saves 0 and never takes away from another life, the mandatory steps per category (4 500, 2 500, 40 000), `refurbishmentByLife` (the logged cost, the fallback, a malformed cost refused), "card 10: ebike-008 on 6 Nov 2026 has saved 332,80 €, and 665,60 € after its third life".
- `asset-events.test.ts`: card 10 through the database (58 kg and 66 560 cents after 24 months, 29 kg and 33 280 on the signing day; a 39 500 refurbishment leaves life 3 at 0), a new item with no history, the fleet totals.
- `passport-handlers.test.ts`: each event writes its row; a later handler failure rolls the row back with the audit row.
- `src/domain/scenarios/card-10-third-life.test.ts` (scenario harness): the passport from the data pack and a logged third life feeds the CO2 counter, [0, 29, 29] → 58 kg; an open third life at 12 months adds 15 kg.

## Open questions

- **`previous_lives` after a return.** The passport reads it as the lives before the log. The exits slice (wave 2) leaves `previous_lives` as it is on a return, so a logged life is not counted twice; the second-life slice (PR #53) keeps it that way: the relist writes the status, condition and usage only, so card 10's third life is the logged one.
- **Design lives and the 24-month past-life estimate** are team assumptions, not data-pack numbers; ask the mentors whether they want them in the data pack.
- Every event has its writer: signing (`CONTRACT_SIGNED`) and the exits (`CONTRACT_BOUGHT_OUT`, `UNIT_RETURNED`, `UNIT_PASSED_ON`) write `leased`, `bought`, `returned` and `passed_on`; the assessment (`assessAsset`, PR #53) writes `assessed`, `refurbished` and `repriced`. Card 10's third-life lease runs on a database in `src/server/scenarios/card-10.test.ts` (32 601, 1 194 a month, 58 kg after 24 months).
