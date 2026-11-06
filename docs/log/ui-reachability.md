# Time log: ui-reachability

Branch `fix/ui-reachability` from `main` at `9d16dd5`, 2026-11-06. From a read-only audit of which features had no way in from the UI.

| Time  | Step                                                                                                                          |
| ----- | ----------------------------------------------------------------------------------------------------------------------------- |
| 10:15 | Audit: invoice payment had no button, the signatory list no link, a returned item's second-life page only the demo button     |
| 10:20 | `pay-invoice-button.tsx` on every owed row of the invoice table; refusals from the message files                              |
| 10:24 | "Who may sign for the company" in a company's portal (My leases and the admin's customer page)                                |
| 10:27 | Second-life link on the returned card (above its stretched passport link), the passport and the ended contract's notice       |
| 10:35 | Checked live: card 1's invoice 1 paid from its button; Norvi's portal link opens the list; the returned card opens ebike-007  |
| 10:52 | Review of #70: refusals through tested `pay-refusal.ts` (via `failureText`); "owed" → "unpaid"; `encodeURIComponent` on links |

The local dev database was behind `main`'s migrations (no `prev_hash`); `prisma migrate deploy` brought it up. Left undone: no form for the admin's PATCH of an asset status, and the assess button still sends no inspection fields (both out of this scope).
