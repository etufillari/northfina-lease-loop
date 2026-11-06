# Lease Loop

**One e-bike, laptop or tractor, three lives.** Lease Loop takes an item from a price quote to a signed contract, through every monthly invoice, to the end of the lease. Then it gives the item a second and a third life with someone new.

Built for the Northfina × Hive Helsinki hackathon (5–6 Nov 2026). The challenge is in [CHALLENGE.md](CHALLENGE.md), the rules in [RULES.md](RULES.md), and the starter repo's original README in [docs/STARTER_README.md](docs/STARTER_README.md).

There is no AI inside the app. Everything runs on rules, data and plain arithmetic.

---

## Run it

```bash
npm ci
npm run db:setup      # creates .env and a seeded SQLite database
npm run dev           # http://localhost:3000
```

Before a demo, `npm run db:reset` gives a clean database.

The home page welcomes you and has the two ways in: **lease one item** from the catalogue, or **lease several items at once** (a fleet, for companies).

Two controls in the header make the demo work:

- **Acting as**: a demo login. Pick a customer from the data pack (Aino, Mikko, Norvi, …) and the app prefills their answers. It shows only their own contracts and invoices.
- **Time travel**: set the app's date, for example to month 7 of a lease, or to the day after it ends. It works **both ways**. Travelling back shows everything as it was on that date, and anything that happened later is locked until you come back.

The **Admin** link in the footer opens totals, VAT changes, the fleet's CO₂ saving, the audit log and the second-life workbench.

---

## A four-minute demo

| #   | Do this                                                            | What it shows                                                                                                                                                              |
| --- | ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Act as **Aino**, open **ebike-003** and move the sliders           | Live price with a plain-language breakdown (card 1, Smart Problem 6)                                                                                                       |
| 2   | Apply, then sign                                                   | Questions appear only when they apply, each with "why we ask"; the price is locked at signing                                                                              |
| 3   | Travel to **20 Jan 2027** and open the invoices                    | December at 25.5 % VAT and January at 26 %: the rent is locked, the tax is not, and the invoice says so (card 3, Smart Problem 1)                                          |
| 4   | Travel to **20 May 2027**, then contract → **End the lease early** | The exit price, worked out line by line, with the first month free (card 8, Smart Problem 2)                                                                               |
| 5   | Admin → Second life → **ebike-007**                                | Refurbish or not, a new price, and who on the waiting list gets it and why (card 9, Smart Problem 3)                                                                       |
| 6   | Open **ebike-008**                                                 | Its passport across three lives and the CO₂ it saved, weighted by how worn it is (card 10, Smart Problem 7)                                                                |
| 7   | Act as **Norvi**, open **ebike-004** and apply                     | "Can't sign for the company" goes to a person, kindly explained (card 6). Then home → **Lease several items at once**: one application and one signature for a whole fleet |

---

## Scenario cards

All ten work. Each one is covered by unit or database tests, and most also by the browser tests.

| Card               | Where to see it                                     | What happens                                                                                                                                                                        |
| ------------------ | --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 Happy path       | ebike-003 → apply → contract                        | 107.30 € a month + VAT 27.36 € = 134.66 €. The first three invoices and the total cost are shown                                                                                    |
| 2 Price lock       | laptop-004: quote on 5 Nov, sign on 6 Nov           | The contract keeps the quoted v1 list price. It shows today's 8 % lower v2 price and says why: the quote was agreed and is valid for 14 days, and later price lists don't change it |
| 3 Tax is not price | ebike-001 invoices                                  | December 25.5 %, January 26 %. The bill warns ahead of the change and stops warning once it has happened                                                                            |
| 4 Calendar traps   | laptop-001 from 31 Jan 2026                         | Due 28 Feb 2026 and 29 Feb 2028 (a leap year). Months are clamped, never skipped                                                                                                    |
| 5 Too young        | Act as Mikko → laptop-008                           | A kind "no": under 18, with what a parent or guardian could do instead. He can't send the form                                                                                      |
| 6 Who can sign?    | Act as Norvi → ebike-004 → apply                    | Manual review: the applicant can't sign for the company, so we ask the person who can. The same rule holds for a whole fleet, where the signatory signs for every item at once      |
| 7 Big ticket       | Act as Haapala → farm-002, 48 months, 20,000 € down | 125,000 € financed brings in the big-deal questions (annual revenue, beneficial owners, farm registry, PEP). One owner is a politically exposed person, so a person must review it  |
| 8 Early exit       | Aino, month 7 of 36                                 | 29 rents left. Still owed 3,306.66 €, the bike is worth 2,878.60 €, so returning it costs 539.36 € incl. VAT                                                                        |
| 9 Second life      | ebike-007, fair, 18,400 km                          | Refurbish to good. **wait-13** gets it: its 24-month rent fits the 90 € budget, while wait-02's 12-month rent doesn't                                                               |
| 10 Third life      | ebike-008                                           | Passport plus CO₂: 2 reuse lives × 145 kg × 20 % life left = 59 kg. A naive count would claim 290 kg                                                                                |

---

## Smart Problems: what's smart about it

**1 · Lock the price, not the tax.** The contract copies the net rent from the approved quote and never recalculates it. Each invoice uses the VAT rate on its own date, rounded once to the cent. The invoice explains why its total changed. Admin can add a future VAT change, and the warnings and invoices follow it.

**2 · Fair early exit.** _Still owed today_ = the remaining rents plus the buyout, each discounted back to today at the contract's own interest rate. Paying early shouldn't cost interest you no longer owe.

- **Buy now:** pay what is still owed.
- **Return now:** pay what is still owed **minus what the item is worth today** (from the residual curves), never below zero.
- **Consistent with the end of the term:** in the last month, "buy now" is exactly the buyout.
- **First month free:** returning before the second invoice costs nothing.
- **Settled first:** open invoices must be paid before the exit.

[`src/domain/early-exit.ts`](src/domain/early-exit.ts)

**3 · Second-life matchmaking.**

- **Value:** age curve × condition × usage.
- **Refurbishing:** the plan comes from the cost table, plus preset or custom repairs.
- **New price:** the value after refurbishment, in whole euros.
- **Waiting list:** those it actually suits come first (budget at their term, minimum condition), then the earliest deadline, then who signed up first.
- **Bonus:** every item has a **passport** of its lives.

[`src/domain/second-life.ts`](src/domain/second-life.ts)

**7 · Circular impact.** A reuse life avoids making a new item, minus the refurbishment. A nearly worn-out item only replaces part of a new one, so the saving is scaled by the life it has left, using the same factors that price it. Every reuse life is scaled by today's state, so the figure under-counts rather than over-claims. E-bike km "instead of a car" is shown separately, because a new bike would do that too. The admin page has the fleet total.

[`src/domain/co2.ts`](src/domain/co2.ts)

**Also covered:**

- **4 · Question flow** ([`question-flow.ts`](src/domain/question-flow.ts)): questions are targeted by customer type, item, amount and earlier answers. Changing an earlier answer drops the answers that no longer apply, and the decision is yes, no or a person with reasons.
- **5 · Money that adds up:** integer cents, rounded once, half up. The invoices add up exactly, which is tested across all terms and a wide range of rents.
- **6 · Explain my price:** every number in the breakdown has a plain-language line.

## Wildcards

- **Time travel that goes both ways:** state is replayed from dated records. See [`src/domain/state-on.ts`](src/domain/state-on.ts).
- **Fleet leasing:** 2–20 items, with one decision and one all-or-nothing signature.
- **Demo login** and **pass-on** to another customer, who must accept.
- **Printable contract and invoices** (Print → PDF).
- **Four languages** (en, fi, sv, et). Switching language never loses what you've typed.
- **Accessibility-first:** WCAG 2.1 AA, checked automatically with axe-core in light and dark mode. See [docs/ACCESSIBILITY.md](docs/ACCESSIBILITY.md), including how to test with a screen reader.

---

## Engineering

| Rule                      | How we keep it                                                                                                                                                       |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pure, tested domain logic | Every business rule is in [`src/domain/`](src/domain/) as a pure function with its own test                                                                          |
| Tests                     | 430 unit and database tests (Vitest, a real SQLite test DB) plus 44 browser checks (`npm run test:e2e`: headless Chrome, scenario cards and axe-core). All run in CI |
| Money in cents            | Integers everywhere. [`money.ts`](src/domain/money.ts) rounds once, half up                                                                                          |
| API envelope              | Every route goes through `handleRoute` / `ok` / `fail` ([`api-response.ts`](src/server/api-response.ts))                                                             |
| Audit log                 | Every change to data goes through `withAudit`, so the change and its audit row are written in one transaction. Issuing an invoice is audited too                     |
| Files under 600 lines     | `npm run check:file-size`                                                                                                                                            |
| Hooks and commits         | Husky pre-commit and pre-push, conventional commits, never `--no-verify`                                                                                             |
| CI                        | Format, lint, types, file size, no-AI check, coverage, build and browser tests                                                                                       |

```
src/domain/    rules: pricing, invoicing, early exit, second life, CO₂, fleet, time travel…
src/server/    database access; each write is one transaction with its audit row
src/app/       pages (/[locale]/…) and API routes (/api/…)
src/components UI
tests/e2e/     browser tests and the accessibility pass
data/          the synthetic data pack (unchanged)
```

## Team

| Name          | GitHub                                                 | Main focus                                                                                                     |
| ------------- | ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| Armin Kuburas | [@ArminKuburas](https://github.com/ArminKuburas)       | Catalogue, pricing, contracts, invoices, time travel, end of term, second life, early exit, CO₂, fleets, tests |
| Johnny Varila | [@zoni527](https://github.com/zoni527) (Hive: jvarila) | The smart question flow and the application                                                                    |
