# Team Patsastus: Lease Loop

A circular leasing app for e-bikes, laptops and farm machines, built at the Northfina × Hive Helsinki hackathon (5–6 November 2026). A customer browses the catalogue, prices a lease with sliders, answers only the questions that apply to them, and signs a contract whose net rent is locked. The app then bills it month by month, prices a fair early exit, and gives the returned item a second life with the next person on the waiting list. It's for customers who want to understand what they pay, and for a lessor who needs every number to be explainable and repeatable.

- 📋 **The challenge:** [CHALLENGE.md](CHALLENGE.md) · 📐 **Rules:** [RULES.md](RULES.md) · 🗂️ **Data pack:** [data/DATA.md](data/DATA.md)
- 🏛️ **Design decisions and formulas:** [ARCHITECTURE.md](ARCHITECTURE.md) · **Per-layer specs:** `src/*/SPEC.md`

## Team

| Name               | GitHub      | Main focus                                                                                                 |
| ------------------ | ----------- | ---------------------------------------------------------------------------------------------------------- |
| Joonas Tuomi       | `jotuel`    | Reservations and longer-term offers, contract and invoice UI, end of term and second life, database wiring |
| Niklas Raatikainen | `patsastus` | Question flow and eligibility, fair early exit, catalogue filters                                          |
| `pinguuiin`        | `pinguuiin` | Lifecycle database models, architecture docs, money core                                                   |

## The Spine

- [x] **Catalogue with today's price:** filter by category and status; prices come from the price list valid today.
- [x] **Price with sliders:** term and down payment update the monthly rent (net and with VAT) live.
- [x] **Application with the question flow:** questions from `data/questions.json`, ending in yes, no or manual review with reasons.
- [x] **Contract that locks the price:** signing stores the quote, application, contract and invoice rows; later price lists never touch them.
- [x] **Monthly invoices from the contract:** net rent locked, VAT at the rate on each due date, a printable bill per invoice.
- [x] **End of term:** buy it, return it or pass it on, each with an audit trail.
- [x] **Second life:** a returned item is valued from the residual curve, condition and usage, relisted at that price, matched to the waiting list and leased again; its passport shows every life.

## Smart Problems we picked

- [x] 1. Lock the price, not the tax
- [x] 2. Fair early exit
- [x] 3. Second-life matchmaking (matchmaking, passport and relisting; no refurbishment decision yet)
- [x] 4. The smart question flow
- [x] 5. Money that adds up
- [ ] 6. Explain my price (a step-by-step breakdown, but no side-by-side comparison)
- [ ] 7. Circular impact (CO₂ avoided per item, shown in the passport)
- [x] Wildcard: **longer-term offers with price protection.** An approved customer can hold a 7-, 14- or 30-day offer; the item is reserved for them with a countdown, and the offered price is locked even if the price list changes before they sign.

**What's smart about our solution?**

- **Tax is not price (#1).** The contract locks the _net_ rent. Each invoice applies the VAT rate valid on its due date, so a 2026 contract moves from 25.5 % to 26 % on the first invoice due in 2027. The invoice table marks the change ("VAT rate updated to 26 %"), so the customer can see why the total moved while the price stayed locked.
- **A fair early exit (#2).** We charge what the lessor is still owed, not the nominal remaining rents: the remaining rents plus the end-of-term buyout, each discounted at the contract's band interest rate. The customer pays no interest for months they don't use, and an exit in the last month costs exactly the end-of-term buyout, so the two never disagree. The present value is one exact `BigInt` fraction, rounded once. A return is credited at the item's inspected market value minus the refurbishment it needs. When a step like a new battery resets usage, we credit the _lower_ of "as returned" and "after the battery", so riding further can never make a return cheaper.
- **Ask only what's needed (#4).** Every question is shown only when its `ask_when` conditions hold, and each one says why we ask, in all four languages. When a customer goes back and changes an answer, answers that no longer apply are dropped and the form shows which. Every amount threshold uses the _financed_ amount, so a down payment can remove questions. Eligibility returns yes, no or manual review with plain-language reasons; the business ID check validates the Finnish check digit, so the broken ID in the data pack is caught.
- **Money that adds up (#5).** Every amount is integer euro cents. Each monthly rent is rounded once (`Math.round` of financed amount × factor), and the contract total is defined as the sum of its invoices, so they always add up. A lease that starts on the 31st is billed on the last day of shorter months (28 Feb 2026, 29 Feb 2028). Property-based tests (Hegel) generate random contracts and check that:

- every invoice row and the schedule total add up to the cent;
- due dates never drift or skip a month, including in leap years;
- worse condition or more usage never makes a return cheaper;
- an exit in the last month equals the end-of-term buyout.
- **The price lock (card 2).** A quote is not a promise: without a saved offer, the price list valid on the signing day is locked, and the contract shows which version it used. A saved offer locks the offered price either way, which is what makes "price protection" a feature rather than a loophole.
- **Trade-offs.**
  - Second life matches by deadline, then signup order, and doesn't yet decide whether a refurbishment (such as fair → good) pays for itself; that's the next step for card 9.
  - There is no login, so the return inspection records who inspected but can't prove it.

## Scenario cards that work

1, 2, 3, 4, 5, 6, 7, 8, 9 and 10. Card 9 gives the bike to `wait-02` at €51.98 a month: we don't model the refurbishment that would make `wait-13` eligible.

## How to run the demo

```bash
npm ci
npm run db:setup
npm run dev
```

Open http://localhost:3000 and switch the language in the header. If an older local database gives errors on every page, run `npm run db:reset`.

- **Cards 1, 3, 4 and 8 (invoices, VAT, calendar, early exit):** pick an item in the catalogue and set the term and down payment. Or open `/en/invoices?asset=ebike-003&term=36&down=0&signedOn=2026-11-05` directly, then use "Show all invoices" and the early-exit month picker.
- **Cards 5, 6 and 7 (questions and eligibility):** _Apply_ from the item's drawer, then answer as Mikko, Norvi or Haapala from `data/customers.json`.
- **Cards 9 and 10 (second life):** open a returned item (`ebike-007`, `ebike-008`) in the catalogue, relist it, then lease it again. Its passport shows each life and the CO₂ avoided.
- **Audit trail:** `GET /api/audit-log`.

## Engineering

- [x] `npm run check:all` passes locally
- [x] CI is green on our last commit (Actions enabled in our fork)
- [x] No `--no-verify` was used
- [x] No AI, ML or LLM features inside the app

Domain logic is pure functions in `src/domain/` with tests next to them, at about 97 % line coverage. Every API route uses the `ok()` / `fail()` envelope, and every data change goes through `withAudit()` in one transaction.

## Anything else the judges should know?

- We used AI coding tools (credited in commits) to write code, never inside the app; `npm run check:no-ai` enforces this.
- The data pack is seeded into SQLite, and the app reads its reference tables from the database.
- The four translation files are machine-assisted and checked by a test for identical keys and placeholders.

---

# Starter repo notes

The sections below are the organizers' original README, kept for setup and tooling.

**Northfina** is a Helsinki-based leasing platform. It started as Etufillari, a bike-leasing service, and now leases any kind of asset. Dealers, banks and customers use it to get from a price quote to a signed contract, then through monthly invoices to the end of the lease. This repo is a small, independent playground, not our product code.

---

## Quick start

You need **Git** and **Node.js 22** (with [nvm](https://github.com/nvm-sh/nvm): `nvm install` reads `.nvmrc`).

```bash
git clone https://github.com/<your-team>/northfina-lease-loop.git
cd northfina-lease-loop
nvm install          # Node 22
npm ci               # installs dependencies and the Git hooks
npm run db:setup     # creates .env and a local SQLite database with the 30 assets
npm run dev          # http://localhost:3000
```

You should see the asset catalogue in English. Switch to Finnish, Swedish or Estonian in the header.

| Command                 | What it does                                                   |
| ----------------------- | -------------------------------------------------------------- |
| `npm run dev`           | Start the app with hot reload                                  |
| `npm test`              | Run all tests once (`npm run test:watch` to keep them running) |
| `npm run test:coverage` | Tests with the 60 % coverage gate                              |
| `npm run check:all`     | **Everything CI runs.** Run it before you push                 |
| `npm run db:migrate`    | After you change `prisma/schema.prisma`: creates a migration   |
| `npm run db:reset`      | Wipe the local database and seed it again                      |
| `npm run db:studio`     | Browse the database in your browser                            |

---

## 15-minute tour

New to TypeScript, Next.js or Prisma? Read these files in this order:

1. **`data/`**: the synthetic data pack. Open `assets.json` and `coefficient-table.json`, then the worked example in [DATA.md](data/DATA.md).
2. **`src/data/`**: Zod schemas that load and type-check every data file. If you want to know a field's type, look here.
3. **`src/domain/coefficient.ts`** and its test: a pure function that finds the pricing factor, and how we test it. **Your business logic goes in `src/domain/`**, written the same way.
4. **`src/domain/price-list.ts`**: picks the right price for a date. The price list changes on Friday.
5. **`src/app/[locale]/page.tsx`**: the catalogue page. Next.js App Router: every folder under `src/app/` is a URL.
6. **`src/app/api/assets/`**: API routes. They use the response envelope (`src/server/api-response.ts`), and the status change writes an audit row in the same transaction (`src/server/audit.ts`).
7. **`prisma/schema.prisma`**: the database. Add your own models (Contract, Invoice, …) and run `npm run db:migrate`.

Handy docs: [Next.js App Router](https://nextjs.org/docs/app), [TypeScript for programmers who know C](https://www.typescriptlang.org/docs/handbook/typescript-in-5-minutes.html), [Prisma](https://www.prisma.io/docs), [Vitest](https://vitest.dev/guide/), [Tailwind CSS](https://tailwindcss.com/docs).

Everything in the skeleton is replaceable. Keep the rules, not necessarily the code.

---

## Submitting

You can't push to this repo. You work in **your own fork** and send us a **pull request**.

1. **One person per team forks** this repo (the **Fork** button, top right) and adds the other two as collaborators in the fork (_Settings → Collaborators_).
2. **Enable Actions in the fork**: open the fork's **Actions** tab and click _"I understand my workflows, go ahead and enable them"_. Now CI runs on every push.
3. Everyone clones the fork and commits as usual. Small, conventional commits; the hooks help.
4. **Before Friday 6 November 16:00**, open a pull request from your fork to `etufillari/northfina-lease-loop` `main`.
   - Title: `Team <name>: <your product name>`.
   - Fill in the template: members, the Smart Problems you picked, and how to demo.
   - You can open it early and keep pushing until the deadline.
5. **At 16:00 we record the latest commit of every open pull request.** That commit is what we judge. Anything pushed later is ignored, and pull requests opened after 16:00 don't count.

We won't merge pull requests. They're only how you hand in your work.

**Heads-up:** forks of a public repo are public, so other teams can see your fork. Your commit history shows who built what, and copying another team's work disqualifies both copies.

---

## Your code is yours

The starter code in this repo is MIT-licensed (see [LICENSE](LICENSE)); use it however you like.

**Your team owns the code you write.** Opening a pull request gives Northfina permission to read and run your code for judging and for interviews with your team. Nothing more: we won't merge it, reuse it or publish it elsewhere without asking you first.

## Help

- During the hackathon: **#ask-a-mentor** on the hackathon Discord.
- A bug in this starter repo: open a GitHub issue here.
- Please follow the [Code of Conduct](CODE_OF_CONDUCT.md).
