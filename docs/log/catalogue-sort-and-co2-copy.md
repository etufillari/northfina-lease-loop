# Time log: catalogue sort and CO₂ copy

Real clock, Helsinki. Coding session: Opus, in the main checkout, on branch `feat/catalogue-sort-co2-copy` from `main` at `e76ab58`. From Panu: what does the catalogue's "Recommended" sort rank by? It turned out to be the database order (asset id), so remove it. Also: a catalogue button in the footer, "How is this counted?" → "How is this calculated?", and the CO₂ method as bullets instead of a block of text.

| When             | What                                                                                                                                                                                                                                                                                                                                                          |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-11-06 11:30 | Traced "Recommended": `listAssets` orders by id and `buildCatalogue` returned the groups unsorted for `default`. No rule behind it. Options given to Panu (circular first, waiting-list demand, remove); Panu chose remove.                                                                                                                                   |
| 11:35            | `catalogueSorts` is `price_asc`, `price_desc`; `DEFAULT_SORT` is `price_asc` (no `?sort=` in the URL). `catalogue.sort.default` removed from the four message files. Test added: no sort and an old `?sort=default` both give lowest price first.                                                                                                             |
| 11:40            | Footer: a "See the catalogue →" button (reuses `home.cta.catalogue`). CO₂ popovers: `impact.how.body` and `passport.method` split into four bullet keys each, plus `impact.how.passport`; label now "How is this calculated?" (sv "Hur beräknas detta?").                                                                                                     |
| 11:42            | D84 in `docs/decisions.md`; `catalogue.md` and `circular-impact.md` updated.                                                                                                                                                                                                                                                                                  |
| 11:45            | `npm run check:all`: 4 catalogue tests failed, they took the old id order for granted. Switched to finding the group by model; the order test now pins lowest price first. Green on the rerun (1674 tests).                                                                                                                                                   |
| 11:50            | Checked live on `localhost:3001`: sort chips, footer button, landing and passport (`ebike-008`) popovers.                                                                                                                                                                                                                                                     |
| 11:55            | This log.                                                                                                                                                                                                                                                                                                                                                     |
| 12:00            | Panu: commit, push, PR. `feat/audit-page-polish` was already merged (#77) and `main` had moved (money saved D80, audit signing D81, D82, D83), so the change went onto `feat/catalogue-sort-co2-copy` from `main`. Conflicts in the CO₂ popovers: the money method from `main` is now bullets too, under a CO₂ and a Money heading. The sort decision is D84. |

## Blocked

Nothing.

## Left undone

- A smarter default order (used units first, or by waiting-list demand) was considered and left out (D84).
