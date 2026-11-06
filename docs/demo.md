# Demo script: the pitch run (10 to 12 minutes)

The run we show the judges, one presenter at the keyboard. It clicks through the product; the organiser's "15-minute tour" in the [README](../README.md) is the other walk, through the code, and stays as it is. The numbers below come from the README "Status" table and the feature pages; a test pins every one of them, so if one differs on the day, the database is not fresh.

## Before you start (not on the clock)

```bash
npm ci
npm run db:reset     # a fresh database: every Run button writes its card once (D70)
npm run dev          # http://localhost:3000
```

A database seeded or assessed before D86 still quotes the old D12 second-life price (market value + refurbishment cost), because the quote reads the latest stored assessment: after pulling D86, run `npm run db:reset` (as above) or re-assess the returned items.

Open `http://localhost:3000/en/demo` in a window about 1 280 px wide, with a second tab on `/en/audit`. Nobody is picked in "Continue as"; each Run button sets the actor and the demo clock itself (D71).

## 0:00 to 1:00, what it is

The landing page (`/en`): one e-bike, laptop or farm machine, three lives. Click into the catalogue: today's price per model, from the price list live on the demo clock's day. Then open the demo page from the teal strip.

- Point at: the **demo clock** on the demo page. Every date the product uses comes from it (one `todayIso()` per request); it is our time machine for cards 2, 3, 4 and 8.

## 1:00 to 8:30, the ten cards in order

Click **Run** on each card, in card order; the page lands where the judges compare the numbers. Say the one number, then go back to the demo page. Run card 1 before card 8: card 8 reuses card 1's contract, and card 1 clicked after card 8 answers `card_already_run` with a link to that contract (D70).

| Time | Card               | Lands on                                         | The one number to point at                                                                                                                                                      |
| ---- | ------------------ | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1:00 | 1 Happy path       | the contract (`/en/contracts/<id>`)              | **10 730** net a month (band B, factor 0.027584); invoices 13 466, 13 466, then **13 520** in January at 26 % VAT                                                               |
| 2:00 | 2 The price lock   | the contract, signed on 6 Nov                    | the rent stays **9 627** from the 5 Nov quote although list 2 says 8 857 today                                                                                                  |
| 2:45 | 3 Tax is not price | the contract's invoices, clock 2027-01-01        | December gross **8 731**, January **8 766**: the net 6 957 never moves, the VAT follows the invoice date                                                                        |
| 3:30 | 4 Calendar traps   | the contract, signed on 31 Jan 2026              | due **28 Feb 2026** and **29 Feb 2028**, ends 30 Jan 2029                                                                                                                       |
| 4:00 | 5 Too young        | the application                                  | **rejected, too young**: Mikko turns 18 on 10 Mar 2027                                                                                                                          |
| 4:30 | 6 Who can sign?    | the application, awaiting the signatory          | 1 × `ebike-004`: band B, **15 144** a month; the page says the contract waits for the signatory and what happens next; only the holder of the one-time signing link signs (D46) |
| 5:30 | 7 Big ticket       | the application, manual review                   | `farm-002`, 20 000 € down: 272 037.5 → **272 038** a month, one rounding; PEP sends it to a person                                                                              |
| 6:15 | 8 Early exit       | card 1's contract and its exit block, 2027-06-05 | 7 rents paid; **buy 330 675**, return 75 945, the D14 balance line by line (the market value by months since lease, D31)                                                        |
| 7:00 | 9 Second life      | see the note below                               | `ebike-007` back fair: no refurbishment beyond the battery and inspection (39 500), **`wait-02` at 6 497** a month for 12 m                                                     |
| 7:45 | 10 Third life      | the passport (`/en/assets/ebike-008/passport`)   | three lives, relisted at 32 601, leased again at 1 194 a month, **58 kg** CO₂ and **665,60 €** saved by the end of the third lease (29 kg and 332,80 € so far, estimated)       |

**Cards 9 and 10.** The Run buttons do all of it (#57): card 9 assesses `ebike-007` and lands on `/en/assets/ebike-007/second-life` (the options, the waiting list with each verdict, `wait-02` first and `wait-13` second because it needs 12 000 more work), card 10 assesses `ebike-008`, leases it a third time and lands on its passport. To show them by hand instead:

- Card 9: pick "Admin" in "Continue as", open `/en/assets/ebike-007/second-life` and click "Assess and relist".
- Card 10: as "Admin", open `/en/assets/ebike-008/second-life` and click "Assess and relist"; pick `cust-olavi`, quote `ebike-008` for 24 months, apply and sign; open `/en/assets/ebike-008/passport`.

**The money saved is estimated and moves with the clock.** Life 2 of `ebike-008` is from before our records, so it counts only the 45 € inspection we know every relisting pays, and the passport says estimated. It uses today's price list (D80), so 314,80 € on 5 Nov becomes 332,80 € on 6 Nov, when v2 raises e-bikes by 5 %.

For card 6, if there is time: open the decision page's demo outbox and follow the signing link. Only the holder of the one-time link signs; the demo outbox stands in for the e-mail the named signatory would get.

## 8:30 to 10:30, the audit chain

Switch to the `/en/audit` tab and reload: every change the run made is a row, with its actor, and the badge says the chain is **intact** with the head hash. In a terminal:

```bash
npm run demo:tamper
```

Reload: the badge names the first broken row. Then the attack a hash chain alone cannot see: `npm run db:reset`, run a card again, and `npm run demo:tamper -- --rewrite` edits a row and recomputes every hash after it. Reload: still broken, "its signature does not match: it was rewritten without the key", because the key lives in `.env`, not the database, and the anchor file beside it kept the old hashes (D81). That is tamper-evident, not tamper-proof ([audit-chain.md](features/audit-chain.md)). `npm run db:reset` restores it after the demo.

## 10:30 to 11:00, language and phone

- Switch the header to **suomi** (or **svenska**) on card 1's contract: the same numbers in the local format; every reason comes from the message files (codes, never sentences).
- Narrow the window to about **375 px**: the page stacks in one column and the header becomes the menu.

## 11:00 to 11:30, close (30 seconds of slack to 12:00)

What is smart: one rounding, half up, in one function; the price locked and the tax not; the D14 early exit line by line; the second-life price and the waiting list ranked by rules, with the reason for every place. No AI anywhere in the product. The decisions are in [decisions.md](decisions.md), the open readings in [mentor-questions.md](mentor-questions.md).

## If something goes wrong

- A Run button answers "already run": the database is not fresh. The button links the earlier records, which still show the numbers; or `npm run db:reset` and reload.
- The clock is on the wrong day: set it on the demo page, or run the card again after a reset.
