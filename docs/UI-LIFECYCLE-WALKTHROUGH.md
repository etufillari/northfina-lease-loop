# Understand and test the lease lifecycle

## The simple idea

**The contract is the agreement. The lease is the agreement running. Invoices are its bills. The workshop prepares the physical item for its next customer.**

| Part              | What it means                                                  | What the app records                                                                         |
| ----------------- | -------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Application       | “Can this customer lease this item?”                           | Customer answers, eligibility result and reasons                                             |
| Contract          | “These are the terms we agreed.”                               | Customer/asset IDs, dates, term, locked net rent, down payment and optional buyout           |
| Lease engine      | “This contract is now running.”                                | Lease ID, ACTIVE/COMPLETED/TERMINATED state, monthly schedule and exclusive asset allocation |
| Invoice           | “This amount is due for this period.”                          | Number, dates, locked net rent, invoice-date VAT and total. Issued does not mean paid        |
| Return            | “The physical item came back.”                                 | Original asset/lease reference and receipt date; item is still unavailable                   |
| Inspection        | “What state is it in?”                                         | Condition, usage reading and required work                                                   |
| Refurbishment     | “We completed the required work.”                              | Confirmed tasks/costs and replacement evidence; only then release allocation                 |
| Second-life offer | “This used item is ready to lease again at this price.”        | Published used price and readiness date                                                      |
| Next lease        | “A different customer has a new agreement for that same item.” | New application, contract and lease IDs; same asset ID/serial                                |

Signing and activation happen together in this app. If any required write/audit fails, both roll back. The signed price does not change when later catalogue prices change. VAT can change between invoices.

## Who handles returns?

**Account = customer area. Circular workshop = admin/operator area.** Our development demo allows switching between these responsibilities; it does not implement separate production staff accounts.

| Order | Person            | Meaning                                                                                                    |
| ----- | ----------------- | ---------------------------------------------------------------------------------------------------------- |
| 1     | Customer          | Selects Return after lease completion: “I want to give the item back.” This is not proof the item arrived. |
| 2     | Customer          | Physically hands over/sends the item outside the software.                                                 |
| 3     | Operator          | Clicks Register physical return after receiving it. Asset stays unavailable.                               |
| 4     | Operator          | Inspects condition/usage and saves the required work plan.                                                 |
| 5     | Operator/workshop | Performs the work outside the software, then confirms the completed tasks.                                 |
| 6     | Operator/system   | Publishes the used offer and releases the allocation only after the checks pass.                           |
| 7     | Next customer     | Applies and signs a new contract for the same physical item.                                               |

Customers should not certify their own repairs. In this demo, you perform both roles to test the full journey. Completion/return selection does not imply payment, receipt, inspection or readiness.

After a standard reset, the circular page still lists six original imported returned assets from the challenge pack. They are not leftover test returns. Your own return receipts/contracts/history are empty until you create a test cycle.

## Before starting a clean UI test

Start or restart the development server:

```bash
npm run dev -- --webpack
```

Open the URL printed by Next.js and choose English for this walkthrough. Select **Aino** using the development customer switcher on the catalogue.

After an approved database reset, expect30 original assets and zero applications/contracts/leases/invoices. Some original assets are deliberately reserved or returned. `ebike-007` and `ebike-008` are imported return scenarios; their existing-life counts are intentional. Customers and question data come from JSON files and remain available after reset. The browser's selected-customer cookie may remain: select Aino explicitly.

## Test1 — Aino gets a contract and lease

1. Open available **ebike-003**.
2. Choose **36 months**, **zero down payment**. See the monthly net price update.
3. Reserve the item and complete the application questions. Prefilled answers come from the selected synthetic customer; review them.
4. On the checkout summary, review rent, duration, payment terms and exit policy. Click Finish and accept the demo signing confirmation.
5. The account opens. Expand the saved contract/lease: its state should be **ACTIVE**.

**What happened:** application approved → signed terms saved → lease created → asset allocated, all with audit protection. A reserved item cannot be leased to another customer at the same time.

**Date note:** today,6 November, uses price-list v2. For ebike-003,36 months and zero down, the expected net is11265 cents (€112.65), not the card1 historical Nov5 amount10730 cents (€107.30).

## Test2 — Generate and understand invoices

1. Click **Generate next invoices (up to3)** in the expanded lease.
2. Read the invoice number, issue/due dates, net, VAT and total. Reload: the rows remain saved.
3. The next batch button generates later periods. It does not charge the same period twice.

For a Nov6 start, the first3 gross totals are **€141.38, €141.38, €141.94**: January uses the fictional26% VAT instead of25.5%. Monthly net remains€112.65.

**What happened:** the engine used signed rent and calendar rules, selected tax for each scheduled invoice date, and saved immutable bills. It did not recalculate signed rent from the catalogue or record payment. Scheduled net rent, down payment and optional buyout are displayed separately; future VAT is additional.

## Test3 — End Aino's lease and choose return

1. Click **Complete at contract end (demo)**.
2. State changes to **COMPLETED**. The control advances the demo to the agreed end date; you do not wait36 real months.
3. Choose **Return through workshop**. The workshop opens.

**Important:** completion does not say invoices were paid, and does not make the physical item available. The allocation stays until safe release through the workshop.

## Test4 — Receive, inspect and repair the bike

Find **ebike-003** in **Circular workshop and asset passports**.

1. Click **Register physical return**. This records receipt against Aino's completed lease.
2. Choose **Fair** condition and enter **18400km**, or a reading at least as high as the existing reading.
3. Click **Save inspection and required work**.
4. Read the work list: fair→good upgrade, battery replacement and safety inspection. For this example the total is **€515.00**.
5. Tick every task only to represent work confirmed for this synthetic demo. Click **Confirm work and publish offer**.

**Expected:** the item is available, with a used price and offer date. The old18400 reading remains in inspection history; the current usage resets according to the pack's recorded replacement rule. Repeated requests must not duplicate costs or life counts.

**What happened:** required work was checked, allocation released, condition/usage updated and a dated used offer published in one audited transaction. The original asset ID/serial was preserved.

## Test5 — Lena leases the same bike

1. Return to the catalogue and change the selected customer to **Lena**.
2. Open **ebike-003** again. Its used price comes from the published circular offer.
3. Choose a valid term (36 months is fine), zero down; complete/sign Lena's application.
4. Open Lena's account and generate an invoice.
5. Open the workshop/passport to inspect the history.

**Pass condition:** same `ebike-003` and serial; a different customer, contract ID and lease ID; new invoices use the new signed rent. Aino's old contract and invoices remain unchanged.

The demo asset timeline cannot move backward: after completing a2029 lease, its re-lease starts no earlier than the2029 readiness date. This is deliberate time travel for testing, not the computer clock changing.

## Other controls

- **Pass on through checked handover:** records the choice, then uses inspection/work and a new customer's contract. It does not overwrite the old contract's customer.
- **Record contractual buyout:** after completion, records the signed buyout obligation and removes the asset from leasable stock. No payment is fabricated.
- **Early return in month7 (demo):** for new contracts with the displayed policy, terminates at that boundary and records min(remaining net rents, signed buyout). The workshop handles the physical return. Already issued future rent requires credits first; this prototype refuses that case.
- Legacy contracts created before fee snapshots may not support buyout/early-return fees. Normal end return remains available.

## What does not prove the test passed?

A selected radio/button alone, a changed page, or a calculated price is not enough. Reload and verify saved state, invoice rows, work/offer history and both distinct leases. Payments are not recorded in this prototype. Controls use development-only identities; they are not production authentication.

Card-specific automated results: [SCENARIO-CARD-RESULTS.md](SCENARIO-CARD-RESULTS.md). Current implementation status: [PROGRESS.md](PROGRESS.md).

## Workshop: who uses it?

The customer chooses Return. The operator receives the actual item, inspects it, performs the required work, then confirms completion. “Demo finish lease” only advances the lease timeline; it does not register physical delivery.

The workshop shows lease test items by default. “Show preloaded challenge examples” also includes the six original returned assets. These are separate items, not duplicate records from your lease. Check the asset ID before receiving anything.

If an item’s estimated value is outside the financing bands, completed work is saved but the item stays unavailable for operator pricing review. No lease offer is published. A 409 means the requested transition conflicts with the saved state; reload and check the current step.
