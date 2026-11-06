# Time log: catalogue feedback (filters, stacking, what is listed, the kids bike)

Real clock, Helsinki. Coding session: Opus, in the main checkout, branch `feat/catalogue-filters` cut from `main` at `a271bca`. From Panu's frontend feedback list, items 5, 6, 7, 10 and 11.

| When             | What                                                                                                                                                                                                                                        |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-11-06 00:05 | Read the catalogue page, the card, `financeOffer` and its tests. Second life does not set a returned unit `available` yet, so a returned unit cannot be quoted: the catalogue lists `available` units only (D42).                           |
| 00:10            | Tests first: `needs_quantity` in `financeOffer` (the kids bike two together, an exact multiple, past 20 refused); then the code (D41). 46 pricing tests green.                                                                              |
| 00:20            | Tests first: `src/domain/catalogue/catalogue.ts` (listing, stacking, versions, filters, sort, `modelVersions`); 18 green.                                                                                                                   |
| 00:35            | `ModelCard` (renamed from `AssetCard`), the catalogue page with the secondary filter row, the price page's notice and "Choose a version", the landing tiles counting listed units. The "Net list prices on" badge removed. Keys in 4 files. |
| 00:45            | Checked live: e-bikes 7 cards, Kids 20 "See details", its page on quantity 2 with the notice; the combine on 10 000 € down; laptops with Pro 14 stacked. The picker checked by setting `laptop-006` available in `dev.db` and back.         |
| 00:50            | 976 tests green. D41, D42, the catalogue and pricing pages, the README, this log.                                                                                                                                                           |

## Blocked

Nothing.

## Left undone

- With today's data no listed model has both a new and a used unit, so the version picker shows only once second life puts a returned unit back (or on the Pro 14's identical pair it shows nothing, by design).
- Returned units are hidden until second life re-prices them; if the demo should show them (cards 9 and 10), they need a "coming back soon" state, not the new-item price.

Closed by the wave 3 upkeep, 2026-11-06 05:39: the task is merged (#32); the version picker shows once second life relists a used unit (#53).
