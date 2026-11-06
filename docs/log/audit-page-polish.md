# Time log: audit page polish

Real clock, Helsinki. Coding session: Opus, in the main checkout, branch `feat/audit-page-polish` cut from `main` at `75069eb`. From Panu: the audit log link goes from the top bar (the demo page has it), and the Details column is one line per field instead of a printed object.

| When             | What                                                                                                                                                                                                                   |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-11-06 10:55 | The audit link taken out of the staff strip; `nav.audit` removed from the four message files (no other reader).                                                                                                        |
| 11:00            | Test first: `src/domain/audit/details.test.ts` (6 cases), then `auditDetailLines` in `src/domain/audit/details.ts`.                                                                                                    |
| 11:05            | The page renders the lines as a two-column `<dl>`; checked live on `/en/audit` (dev server restarted: Turbopack had not picked up the new class).                                                                      |
| 11:10            | Feature pages `audit-chain.md` and `look.md` updated; `npm run check:all`.                                                                                                                                             |
| 11:20            | Panu: the inline lines still ran off screen. Replaced with a "View details" button per row that opens a card in a dock at the bottom of the screen; several open side by side; checked at desktop width and at 375 px. |

## Blocked

Nothing.

## Left undone

- The "Chain broken at entry #1 (an entry without a hash)" on Panu's local database is 9 rows written before the chain existed (5 Nov 18:38); `npm run db:reset` clears it. Not a code fault.
