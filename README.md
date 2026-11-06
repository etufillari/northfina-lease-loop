# Lease Loop

A circular leasing app for e-bikes, laptops and farm machines, built for the Northfina × Hive
Helsinki hackathon (5–6 Nov 2026). One item goes round the whole loop: catalogue → live price
→ application → signed contract → monthly invoices → end of term (buy, return or pass on) →
second life (inspect, refurbish, re-price, lease to the next person) — and again. Passing a
lease on works two ways: a hand-over link mid-term, or a successor nominated for when it ends.

No AI inside the product: every decision is a tested rule over the data pack. The challenge is
in [CHALLENGE.md](CHALLENGE.md), the rules in [RULES.md](RULES.md), and every product and
engineering decision, with its reasoning, in **[docs/DECISIONS.md](docs/DECISIONS.md)**.

## Smart Problems we picked

| #   | Problem                     | What's smart about it                                                                                                                                                                                                                                                                                                              |
| --- | --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Lock the price, not the tax | Net rent locked at signing; VAT at the rate on each invoice's due date. The contract page explains the 1 Jan 2027 rise as tax, not price. The quote locks its price-list version for its day and the next (card 2).                                                                                                                |
| 2   | Fair early exit             | Re-price the months actually used at the term that would have covered them, plus a two-month fee, at least 6 months charged, never more than staying. The full calculation is shown before confirming.                                                                                                                             |
| 3   | Second-life matchmaking     | A meter reading at every return and wear counted across leases at the return inspection, mandatory work, at most one upgrade only when it pays for itself, re-price at market value, first come first served with a reason per waiter, whole sets for multi-item waiters, offers that lapse and pass on, and a passport.           |
| 4   | The smart question flow     | A pure engine over `data/questions.json`: each question only when it applies, with "why we ask", answers pruned when an earlier one changes, kind stops (under 18, residency), and every eligibility rule returned with its reason — affordability checked in every month of the lease, together with the customer's other leases. |
| 5   | Money that adds up          | Integer cents throughout, one rounding rule, the last invoice absorbs the leftover cents, due dates clamped to short months (31 Jan → 28 Feb → 31 Mar, 29 Feb 2028), property-based tests.                                                                                                                                         |

Also touched: **#6** (a price breakdown in the configurator) and **#7** (CO₂ avoided per life
on the passport, from the second life on, and a per-customer counter on My page).

## Wildcards

- **A shared time machine** that only moves forward (+1 day / week / month, or a later date),
  running the overnight job for every day passed — unsigned approvals expire, unanswered offers
  pass to the next person — plus a **Reset** that rebuilds the data pack and starts on 1 Jan 2026.
- **Fleet leases:** several distinct items in one contract, banded on the total.

## Run it

You need **Node 22** (`.nvmrc`). Other versions break the SQLite driver — run `nvm use` in
every new terminal.

```bash
nvm use              # Node 22
npm ci
npm run db:setup     # .env + a local SQLite database seeded from the data pack
npm run dev          # http://localhost:3000
```

`npm run dev:fresh` resets the database first (stop the dev server before). `npm run
check:all` runs everything CI runs.

## Demo

The amber **Demo** bar above the navigation holds the stand-ins for things a real deployment
has: **who you are** (a customer persona or Staff, instead of a login) and **the date** (time
travel, instead of the calendar). Press **Reset demo** to start from 1 Jan 2026. Time only moves
forward, so the cards run in date order:

| Date (jump to) | Persona            | Card                                                                                           |
| -------------- | ------------------ | ---------------------------------------------------------------------------------------------- |
| 31 Jan 2026    | Aino Virtanen      | **4** — lease laptop-001 for 36 months; the contract lists due dates 28 Feb 2026 … 29 Feb 2028 |
| 15 Sep 2026    | Aino Virtanen      | **3** — lease ebike-001 for 24 months; December at 25.5 % VAT, January 2027 at 26 %            |
| 05 Nov 2026    | Aino Virtanen      | **1** — ebike-003, 36 months, no down payment: rent net/with VAT, invoices, total              |
| 05 Nov 2026    | Aino → +1 day      | **2** — quote laptop-004 on Thursday (v1), sign Friday (v2 live): v1 stays locked              |
| 05 Nov 2026    | Mikko Laine        | **5** — laptop-008: the form stops at the birth date and says when he can apply                |
| 05 Nov 2026    | Norvi Logistics Oy | **6** — ebike-004: approved, waiting for the company's signatory (see Known limits)            |
| 05 Nov 2026    | Haapalan Tila Oy   | **7** — farm-002, 48 months, €20,000 down: company and ownership questions, manual review      |
| 05 Nov 2026    | Staff              | **7** cont. — approve Haapala on the staff desk                                                |
| 05 Nov 2026    | Staff              | **9, 10** — Second-life desk: ebike-007 → wait-02 at €64.97/month; ebike-008 → wait-01         |
| 05 Nov 2026    | Sanna Mäkelä       | **10** cont. — accept the ebike-008 offer on the waiting list, apply, sign; open its passport  |
| 06 May 2027    | Aino Virtanen      | **8** — card 1's contract, month 7: early-exit calculation, then confirm                       |

The same cards run as automated tests in
[src/server/scenario-cards.test.ts](src/server/scenario-cards.test.ts), and the data pack's
traps (band boundary, minimum and maximum, broken business ID, reserved item) in
[src/server/edge-cases.test.ts](src/server/edge-cases.test.ts).

## How it is built

| Where         | What                                                                                                                                                                             |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/domain/` | Every business rule as a pure, tested function: pricing, VAT, invoicing, early exit, eligibility, question flow, second life, inspection, holds… ([index](src/domain/README.md)) |
| `src/server/` | Database work: each change in one transaction with its audit row (`withAudit`); identity from one function, `currentUser()`                                                      |
| `src/app/`    | Pages (`[locale]/…`) and API routes (`api/…`, one response envelope)                                                                                                             |
| `src/i18n/`   | The four languages and the date/number formats                                                                                                                                   |
| `prisma/`     | The database schema and its migrations                                                                                                                                           |
| `data/`       | The hackathon data pack ([DATA.md](data/DATA.md))                                                                                                                                |

`DEMO_MODE=off` (see `.env.example`) switches the demo stand-ins off: "today" is then always
the real date and nobody is signed in until a real login replaces the body of
`currentUser()` (`src/server/current-user.ts`).

## Known limits

- **A company's signatory signs alone**, and the app has no persona or e-mail signing link for
  them yet, so card 6 ends at "waiting for the signatory" in the browser. The scenario test
  signs as the signatory on the server.
- **No wear charge:** wear lowers the next customer's price; a charge for abnormal use is
  designed in DECISIONS.md but not built.
- **No real login or payments:** the persona picker stands in for sign-in, and invoices are
  issued but not collected.
