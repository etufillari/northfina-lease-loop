# Lease Loop · Northfina × Hive Helsinki hackathon

**Every item has more than one life.** Lease Loop takes an e-bike, a laptop or a tractor round the whole leasing loop: catalogue, live price, application, a contract that locks the price, monthly invoices, the end of the term, and a second (and third) life for the returned item, with its passport and the CO₂ it saved.

Everything in the app is rules, data and algorithms: no AI, ML or LLM inside the product.

- 📋 **The challenge:** [CHALLENGE.md](CHALLENGE.md) · 📐 **Engineering rules:** [RULES.md](RULES.md) · 🗂️ **Data pack:** [data/DATA.md](data/DATA.md)
- 🧭 **Every decision we made, and why:** [docs/decisions.md](docs/decisions.md)

**Northfina** is a Helsinki-based leasing platform. This repo is a fork of their hackathon starter, not their product code.

---

## What we built

**The Spine, end to end:** catalogue with today's price → term and down-payment sliders with a live monthly price → a stored quote → the question flow with a yes, a no or manual review → signing locks the quote → monthly invoices from the locked contract → buy, return or pass on → a returned item is valued, refurbished, re-priced and leased again.

| Smart Problem                     | Where to see it                                                                     | Decisions                         |
| --------------------------------- | ----------------------------------------------------------------------------------- | --------------------------------- |
| 🧾 1. Lock the price, not the tax | Quote and contract pages: VAT steps before signing, VAT per invoice date            | D-011, D-014, D-034, D-037        |
| 🚪 2. Fair early exit             | Contract page, _Leave early_: a month slider and every line of the price            | D-033, D-039                      |
| ♻️ 3. Second-life matchmaking     | A returned item's page: valuation, refurbishment plan, ranked waiting list          | D-032, D-035                      |
| 🧠 4. The smart question flow     | Quote page, _Apply_: only the questions that apply, "why we ask", answers set aside | D-022 to D-025, D-028, D-031      |
| 💶 5. Money that adds up          | Contract invoices; property-based tests over random contracts                       | D-005, D-015 to D-017, D-037      |
| 🔍 6. Explain my price            | Item and quote pages: price breakdown and the term comparison                       | D-002, D-012, D-013, D-021, D-037 |
| 🌍 7. Circular impact             | Item passport: every life and the CO₂ avoided by each                               | D-036                             |

Plus the demo tooling a judge needs: a **demo date** that the whole app treats as today (D-030), personas that fill in the application from the customer record (D-031), the **audit trail** of every change, and four languages (en, fi, sv, et).

---

## How to run

You need **Git** and **Node.js 22** (`nvm install` reads `.nvmrc`). No secrets or accounts are needed.

```bash
npm ci               # dependencies and Git hooks
npm run db:setup     # .env and a local SQLite database seeded with the 30 assets
npm run dev          # http://localhost:3000
```

For the demo itself, a production build is faster: `npm run build && npm run start`.

| Command                 | What it does                                                     |
| ----------------------- | ---------------------------------------------------------------- |
| `npm run dev`           | Start the app with hot reload                                    |
| `npm test`              | Run all tests once                                               |
| `npm run test:coverage` | Tests with the coverage gate                                     |
| `npm run check:all`     | **Everything CI runs**: format, lint, types, sizes, no-AI, build |
| `npm run db:reset`      | Wipe the database and seed it again: run it between demo runs    |
| `npm run db:studio`     | Browse the database in your browser                              |

---

## Demo walkthrough: the scenario cards

Three controls in the header do most of the work:

- **Demo date.** Pick the day the app treats as today; it prices, signs and invoices as of that day (in this browser only). _Back to today_ resets it.
- **Language.** English, Finnish, Swedish, Estonian.
- **Audit trail.** Every quote, signature, ending and re-listing, with who, what and when.

On a quote page, **Fill in as (demo)** picks a customer from `data/customers.json` and fills in the answers their record already holds; the server refuses answers that contradict the record. Start each run from `npm run db:reset`: cards 9 and 10 change the database.

The amounts below are worked by hand in the decision log and pinned by tests (`src/domain/scenarios*.test.ts`, `src/server/*.test.ts`).

### 1. Happy path: Aino leases ebike-003

1. Demo date **5 Nov 2026**. Open the _Nordvolt Trail 500_ (ebike-003), 36 months, no down payment.
2. The calculator shows **107.30 €** a month excl. VAT, **134.66 €** with 25.5 % VAT, and **135.20 €** from 1 Jan 2027 when VAT goes to 26 %. Total with VAT: **4 866.12 €**.
3. _Get my quote_ → fill in as **Aino Virtanen** → answer what is left → _Sign and lock this price_.
4. The contract lists the first invoices: 5 Nov and 5 Dec 2026 at 134.66 €, 5 Jan 2027 at 135.20 €.

### 2. The price lock: laptop-004, quoted Thursday, signed Friday

1. Demo date **5 Nov 2026**. Open laptop-004, 36 months → _Get my quote_: **96.27 €** a month on price list 1, valid until 12 Nov.
2. Change the demo date to **6 Nov 2026** and reload the quote page. Price list 2 is live and laptops are 8 % cheaper, so the page offers **88.57 €**, 7.70 € less, and lets the customer choose.
3. _Keep my quote_ locks 96.27 € on price list 1; _Sign at today's price_ locks 88.57 € on list 2. Either way the contract is exactly the quote on screen (D-014, D-034).

### 3. Tax is not price: ebike-001 from 15 Sep 2026

1. Demo date **15 Sep 2026**. Open ebike-001, 24 months, quote and sign (as Aino, or with an empty form).
2. On the contract: **15 Dec 2026** is 69.57 € + 17.74 € VAT (25.5 %) = **87.31 €**; **15 Jan 2027** is 69.57 € + 18.09 € VAT (26 %) = **87.66 €**. The net rent never changes; only the VAT rate on the invoice date does.

### 4. Calendar traps: laptop-001 from 31 Jan 2026

1. Demo date **31 Jan 2026**. Open laptop-001, 36 months, quote and sign.
2. The invoices fall due on **28 Feb 2026**, back on **31 Mar 2026**, and on **29 Feb 2028** (a leap year). Billing follows the start day, clamped to short months (D-016).

### 5. Too young: Mikko applies for laptop-008

Demo date 5 Nov 2026. Quote laptop-008 and fill in as **Mikko Laine**. The application is declined as soon as his birth date is known, with the reason and the day he can apply again, and no way to sign.

### 6. Who can sign? Norvi Logistics and ebike-004

Quote ebike-004 and fill in as **Norvi Logistics Oy**. The applicant can't sign for the company, so the flow asks for an authorised signatory's email and explains why; signing here is refused. One contract covers one item; contracts for a fleet of items (the card's _4 ×_) were not built.

### 7. Big ticket: Haapalan Tila leases farm-002

1. Open farm-002 (145 000 €), 48 months, down payment **20 000 €**.
2. Quote and fill in as **Haapalan Tila Oy**. The farm, revenue, ownership and PEP questions appear, each with "why we ask". The outcome is **manual review**: a politically exposed person always goes to a person.
3. The quote shows the down payment as invoice 0 and **3 427.68 €** a month from 1 Jan 2027; **189 601.44 €** in total with VAT.

### 8. Early exit: Aino leaves in month 7

On the contract from card 1, _Leave early_ has a month slider. At **month 7** the page shows every line: the rents left, valued today at the band's interest rate, the buyout, and what the bike is worth now. **Buy it now: 4 189.82 €** with VAT; **hand it back now: 268.70 €**. Any month is a what-if; a choice can be confirmed only in the lease's current month, so move the demo date forward to confirm. Why this is fair: D-033; each rent is discounted from its own due date (D-039).

### 9. Second life: ebike-007 and the waiting list

1. Demo date **6 Nov 2026**. Open ebike-007 (returned, fair, 18 400 km).
2. The page values it (927.81 € as returned), plans only what it needs (new battery 350 €, safety inspection 45 €), and ranks the waiting list: **wait-02 wins** over wait-13 because wait-02 takes it in fair condition, while wait-13 would need a 120 € upgrade to good. Rent: **64.97 €** a month for 12 months.
3. _Refurbish and re-list_ makes it available at 1 159.76 €; it can be quoted and signed like any item.

### 10. Third life: ebike-008 and its passport

1. Demo date **6 Nov 2026**. Open ebike-008 (2 lives), re-list it in good condition at **326.01 €**, then quote and sign it for 36 months at **9.33 €** a month.
2. _Item passport and CO₂ saved_ shows lives 1 and 2 before Lease Loop and life 3 with **26 kg** of CO₂ avoided, with the formula: a worn item counts only for the share of its value it has left (D-036).

---

## Architecture

```text
data/*.json ──► src/data (Zod schemas, loaders)
                      │
                      ▼
               src/domain  ◄── pure functions: pricing, VAT, calendar, invoicing, question flow,
                      │        eligibility, signing, early exit, second life, waiting list, CO₂
                      ▼
               src/server  ◄── Prisma (SQLite), withAudit() transactions, today's date
                 │        │
                 ▼        ▼
      src/app/api/*    src/app/[locale]/*  ◄── src/components (client UI), src/i18n (en, fi, sv, et)
   (JSON envelope)     (server-rendered pages)
```

- **`src/domain/`**: every business rule as a pure function, with its tests next to it. No database, no clock, no randomness: dates are ISO strings passed in, money is integer cents, and every amount is rounded once with `roundHalfUp` (`money.ts`, D-005). The browser runs the same functions for the live sliders; the server runs them again before anything is stored (D-018).
- **`src/server/`**: loads the data pack and the database, decides "today" from the demo date (D-030), and writes every change through `withAudit()`, so the change and its audit row commit in one transaction.
- **`src/app/api/`**: `assets`, `quotes`, `contracts` (with `end` and `end-early`), `assets/:id/relist`, `as-of` and `audit-log`. Every route uses `ok()` / `fail()` / `handleRoute()`; each refusal has its own code, status and translated message (D-038).
- **`src/app/[locale]/`**: catalogue, item, quote, contract, passport and audit pages.
- **`prisma/schema.prisma`**: `Asset`, `Quote`, `Contract`, `ContractEnding`, `SecondLifeListing` and `AuditLog`. Quotes and contracts are stored as frozen JSON snapshots, so a later price list can't touch them (D-019).

**Tests:** Vitest unit tests for every domain function, fast-check property tests (invoice schedules always add up to the contract total, early exit converges to the buyout, matching never depends on input order), and server tests against a real SQLite database. Expected values come from hand calculations, never from running the code (D-006).

## Where decisions live

[docs/decisions.md](docs/decisions.md) holds every product, domain and engineering decision (D-001 onwards) with its context, the alternatives, why we chose it and the evidence. Each one is logged in the same PR as the change, and an old entry is never rewritten, only superseded. The scenario-card answers above are worked out there.

---

## License

The starter code is MIT-licensed (see [LICENSE](LICENSE)). Please follow the [Code of Conduct](CODE_OF_CONDUCT.md).
