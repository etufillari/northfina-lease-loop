# Demo tips: the scenario cards

How to show each scenario card from [CHALLENGE.md §4](CHALLENGE.md#4-scenario-cards) in a
running app, what to point out, and what doesn't work yet. Start from a fresh database
(`npm run db:reset`, then `npm run dev`) so every card begins as described.

## The demo bar

In demo mode (on by default in development) a dark bar sits above the header:

- **Demo date:** the whole app treats this date as today (price list, contract start,
  invoices, VAT). Choose a date and press **Set date**; **Use today's date** goes back.
- **Act as:** signs this browser in as a data-pack persona, or as **Staff (demo)**.
  Switching sets up that persona's card: Aino already has her lease; Mikko, Norvi and
  Haapala start with their item in the cart. Everyone else starts with an empty cart.
- **Current user:** signed in with your own account, "Act as" shows **Current user ·
  your name**. The demo date then applies to your own leases and actions. Switch to any
  persona and back: **Current user** signs you in as yourself again (your session is kept
  in a cookie when you first switch away). Personas still start fresh at their scenario on
  each switch, and changing the date while acting as one carries on from where they are.
- Catalogue cards and product pages show each item's ID (`ebike-003`) in a dark chip.

Set the **date first**, then switch persona: the persona's scenario uses the date that's
set when you switch.

**Going back in time undoes.** Setting an earlier date undoes the signed-in account's demo
actions after it: a lease signed later disappears (its item is back in the catalogue),
later invoices, payments and events go, a later buyout is reopened, and a company contract
signed later waits for its signatory again. Move forward and the persona's scenario is set
up again (Aino's lease reappears from 5 Nov). Real leases and other accounts are never
touched; a return completed after the date is not undone.

## Status at a glance

| Card | Scenario                | Status | Notes                                                        |
| ---- | ----------------------- | ------ | ------------------------------------------------------------ |
| 1    | Happy path (Aino)       | ✅     | Lease ready on switch; invoices issued up to the demo date   |
| 2    | The price lock          | ✅     | Thursday quote vs Friday price shown; signing locks Friday's |
| 3    | Tax is not price        | ✅     | VAT change shown on Aino's invoices and on any forecast      |
| 4    | Calendar traps          | ✅     | Issued invoices list 28 Feb 2026 and 29 Feb 2028             |
| 5    | Too young (Mikko)       | ✅     | Kind explanation, date he can apply, email to a guardian     |
| 6    | Who can sign? (Norvi)   | ✅     | Contract waits for the named signatory, who signs by link    |
| 7    | Big ticket (Haapala)    | ✅     | Due-diligence and PEP questions, manual review with reasons  |
| 8    | Early exit (Aino)       | ✅     | Buyout and early return, formula shown                       |
| 9    | Second life (ebike-007) | ✅     | Refurbish yes; wait-13 wins, with the reasons shown          |
| 10   | Third life (ebike-008)  | ✅     | Lease again; the passport lists its lives and CO₂ avoided    |

---

## 1. Happy path: Aino leases `ebike-003`

1. Demo date **2027-01-10** → **Set date**. Act as **Aino Virtanen** → **Switch**.
2. **Account → My leases → Nordvolt Trail 500.**

Point out:

- Signed **5 Nov 2026** on price list v1: list price €3,890.00, 36 months, no down payment.
- Monthly rent **€107.30 net**, **€134.66 incl. VAT** (data guide's worked example, to the cent).
- **Issued invoices:** 5 Nov, 5 Dec (VAT 25.5 %, €27.36) and **5 Jan 2027 (VAT 26 %, €27.90)**.
  Under January: "VAT goes from 25.5 % to 26 %, so the monthly payment changes by
  **+€0.54**. Your net rent stays €107.30", and that the 26 % rate is fictional.
- **Payments and agreement** lists upcoming payments and the end-of-term buyout (€583.50 net).
- Move the date to **2027-02-05** and reopen the lease: the February invoice has been
  issued (billing runs when the customer opens their account, and the audit log records
  it). On demo leases, invoices past their due date are marked paid by a simulated
  payment; the one due today stays open.

To sign card 1 live instead: set the date to **2026-11-04** before switching to Aino (no
lease yet), then on **2026-11-05** add `ebike-003`, apply and sign. Or lease the identical
twin `ebike-012`.

## 2. The price lock: `laptop-004`, quoted Thu, signed Fri

1. Demo date **2026-11-05**. Act as any adult consumer, e.g. **Lena Tamm**.
2. Open `laptop-004`: **€3,490.00** net (price list v1). Add to cart, apply.
3. Demo date **2026-11-06**: the catalogue now shows **€3,211.00** (v2, laptops −8 %).

4. Open the cart and continue to checkout. The approval still holds (it's valid for 7
   days), and an amber panel says **"The price changed since your quote"**: quoted
   €3,490.00 (v1), today €3,211.00 (v2), the lower monthly payment, and "Good news: the
   item is €279.00 cheaper."
5. Tick **"I accept today's price. Signing locks it for the whole lease."** and confirm.
   Without the tick, signing is refused: a price never changes silently, in either direction.
6. Open the lease: "Price locked from price list v2" and "You were quoted €3,490.00
   (price list v1) on 5 November 2026; signing locked €3,211.00…".

The rule: a quote is an estimate; **signing** locks the price list valid on the signing
day. Move the date further on: later price lists never change the signed contract.

## 3. Tax is not price: `ebike-001` from 15 Sep 2026

Quickest: use Aino from card 1. Her **5 Dec 2026** and **5 Jan 2027** invoices have the
same net rent (€107.30) but VAT goes from **25.5 % to 26 %** (€27.36 → €27.90).

For the card exactly: demo date **2026-09-15**, act as **Lena Tamm**, lease `ebike-001` for
24 months (€1,899.00, under €2,000, so no income question). Move the date to **2027-01-20**
and open the lease: **Upcoming payments** shows the monthly total changing in January with
"VAT 25.5 %" → "VAT 26 %" while the net rent stays locked.

## 4. Calendar traps: `laptop-001` from 31 Jan 2026

1. Demo date **2026-01-31**. Act as **Lena Tamm**, lease `laptop-001` for 36 months.
2. Open the lease.

The rule: due dates keep the start day and clamp to the month's last day, so the
**February 2026** invoice is due **28 Feb 2026** and **February 2028** is due **29 Feb 2028**
(leap year). See `dueDateForMonth` in `src/domain/lease-billing.ts`; its tests check both.

To show it live: move the demo date to **2028-03-01** and open the lease again.
**Issued invoices** lists every month, including **28 Feb 2026**, **30 Apr 2026** and
**29 Feb 2028**, each with its net rent, VAT rate and VAT. Each month is issued on its
due date the next time the customer opens their account (see card 1).

## 5. Too young: Mikko (17), `laptop-008`

1. Act as **Mikko Laine** (any date in Nov 2026). `laptop-008` is already in the cart.
2. **Continue to application**: every answer is prefilled from his record. Submit.

Point out the page title **"Not just yet"**:

- A simple reason: a lease is a promise to pay every month, and the law says you must be
  18 to make it on your own. It's the same rule for everyone.
- **"You're welcome to apply yourself from 10 March 2027"**, calculated from his birth date.
- **"Would you like it sooner?"**: a parent or trusted guardian can lease it in their name.
  **Email this to a parent or guardian** opens his mail app with a ready-written message,
  the laptop, €118.57 a month and a link. The app sends and stores nothing.

## 6. Who can sign? Norvi Logistics, 1 × `ebike-004`

(The organisers clarified that the card means **1 ×**; it's about the signing flow.)

1. Demo date **2026-11-06**. Act as **Norvi Logistics Oy**. `ebike-004` is in the cart.
2. Apply: "Can you sign contracts for the company?" is prefilled **No**, so the flow asks
   for the signatory's email. Enter e.g. `ceo@norvi.example.com`. Submit.
3. The page says **"Waiting for ceo@norvi.example.com to sign"**, not "approved": nothing
   is approved for the company until they sign. Continue and confirm checkout to lock the
   price and reserve the bike.
4. **My leases**: the bike is **Waiting for signature**, with an amber panel and an
   **Email the signing link** button (opens the customer's mail app, link included).
5. Set the date to **2026-11-20**, click **Open the signing page (demo)**: no login, the
   terms, an "I have the right to sign" box. **Sign contract**.
6. Back on the lease: **Active**, "Signed by ceo@norvi.example.com on 20 November 2026",
   billing from 20 Nov. The audit trail names the signatory.

## 7. Big ticket: Haapalan Tila, `farm-002`

1. Demo date **2026-11-06**. Act as **Haapalan Tila Oy**. `farm-002` is in the cart:
   €145,000, **48 months, €20,000 down** (€125,000 financed).
2. Apply. Point out the questions that appear only because of the amount and type:
   **annual revenue** and **beneficial owners** (company, ≥ €50,000), **PEP** (≥ €10,000),
   and **farm registry** (farm machine). Each has a "Why we ask".
3. PEP is prefilled **yes** from her record (one owner is a politically exposed person);
   add a short PEP detail, which the flow now asks for. Submit.

Result: **a person needs to review**, with both reasons: PEP, and financing of €50,000 or
more always gets a human review. Nothing is signed or charged.

Then act as **Staff (demo)** → **Admin** → **Applications**: Haapalan Tila's application
is waiting, with both reasons. Write a note (e.g. "PEP checked, revenue covers it") and
**Approve**. Switch back to **Haapalan Tila Oy** and reopen the application: it's now
**approved** and can continue to signing. The decision and note are in **Audit trail**.

## 8. Early exit: Aino in month 7

1. Demo date **2027-05-20** (month 7 of 36). Act as **Aino Virtanen**.
2. **My leases → Nordvolt Trail 500 → Buy this item.**

Point out:

- Remaining rent **€3,558.58** + final purchase amount **€607.81** (incl. VAT), plus any
  unpaid invoices, with the formula on the page.
- Fairness: future rent is discounted at the contract's own interest rate, so paying early
  costs less than paying monthly; in the last month it equals the normal end-of-term buyout.
- **Return** instead: the guided condition check values the bike (about €3,818 here), and
  the early-return charge is the remaining value owed minus what the bike is worth, never
  more than the remaining rent. Same formula family, so buyout and return stay consistent.

### End of term (Spine 6): Aino after month 36

Set the demo date to **2029-11-06** and open Aino's lease. Her term ended on 5 Nov 2029, so
the page says **"Your lease ended on 5 November 2029"**. She can buy it for **€735.21**
(the locked €583.50 buyout plus 26 % VAT) or return it. No more rent is billed. Buying
marks the bike **sold**: it leaves the fleet and never returns to the catalogue or the
waiting list.

## 9. Second life: `ebike-007` (fair, 18,400 km)

1. Act as **Staff (demo)** → **Admin** (floating button) → **Returns**.
2. Open **Nordvolt Cargo Duo** (status **Received**): the inspection, refurbishment work
   and costs from `refurbishment-costs.json`, then refurbishment sign-off.
3. **Put back on the market**: the new price before you confirm (original price × age ×
   condition × usage from `residual-curves.json`, minus work), with an example monthly rent.

4. Below the workbench, **Refurbish, and who gets it next** (demo date on or before
   **10 Nov 2026**, the waiting-list deadline):
   - **Refurbish: yes.** Worth €1,866.60 excl. VAT after €670.00 of work: €1,196.60 ahead.
   - **wait-13 gets it**, 24 months at **€68.39** a month excl. VAT.
   - Why not `wait-02`? Same €90 budget and deadline, but they want **12 months**, which
     makes the rent **€104.57**, over budget. The work brings the bike to **good**, so
     `wait-13`'s minimum condition is met. `wait-04` qualifies too but needs it by January,
     so the earlier deadline wins. Same date → whoever signed up first.
   - Every other e-bike entry is listed with its rent and the check it failed.

## 10. Third life: `ebike-008` (2 previous lives)

1. Act as **Staff (demo)** → **Returns** → **Kettu Bikes Urban 1** (**Ready to relist**).
2. **Put back on the market** at the shown price.
3. Act as **Olavi** (returned this bike after 24 months), or anyone, and lease it again.
4. The lease page shows the **CO₂ avoided** by reusing it instead of making a new one.
5. Open the **product page** of `ebike-008` (before or after leasing): the **Item
   passport** lists life 1 (before our records), life 2 (dates, 36 months, started good,
   returned) and, once leased, life 3, with **130.7 kg CO₂e** avoided per reuse life and
   the method stated.
