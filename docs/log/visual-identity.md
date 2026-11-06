# Time log: the look (PR #19, `feat/visual-identity`)

Panu's session, 2026-11-05 (Helsinki time).

| Time  | Step                                                                                                                                                                                                                                                                                          |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 20:55 | Review of the design idea against the hackathon's needs; decision to change the visual approach with the team's go-ahead.                                                                                                                                                                     |
| 21:05 | Tokens and fonts swapped in `globals.css`; the kit restyled through its roles.                                                                                                                                                                                                                |
| 21:15 | `PriceTag`, `LifeStamp`, `ItemArt`; the header split into the staff strip and the customer header.                                                                                                                                                                                            |
| 21:25 | Front page, price page, decision, passport and contract restyled; texts in four languages.                                                                                                                                                                                                    |
| 21:35 | `check:all` green (718 tests); six commits; PR #19 opened.                                                                                                                                                                                                                                    |
| 22:00 | Review fixes: focus ring on the strip, shadow and hover tokens, stamp sizes and shorter sv / et notes, life colours, the wider diagram, input borders, `artKindFor` test; D21 kept to one table row.                                                                                          |
| 23:05 | `main` merged in (audit chain, exits, decision race): the four message files combined key by key, the audit page keeps both the back-office note and the chain badge; the phone-width overflow on the landing page fixed (`grid-cols-1`); D21 reworded; this log and `docs/features/look.md`. |

Left undone: fonts from `next/font/local` (the build needs Google Fonts today); gating the audit page itself.

Closed by the wave 3 upkeep, 2026-11-06 05:39: the task is merged (#19); the 375 px check of every page is the hardening's.
