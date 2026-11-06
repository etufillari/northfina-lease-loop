# Test the full lease loop

**The customer manages their agreement and requests a return. Company operations handles the physical item, repairs and approval.**

## Setup and navigation

Run `npm run dev -- --webpack`.

- **Customer view:** catalogue, My leases and account. Select Aino with the development customer switcher.
- **Company view:** click **Company operations** above Dev mode in the sidebar. Your teammate’s separate admin profile and Returned navigation are retained. Click **All operations** to find active leases and invoice controls.
- Sign in to the workshop with `LEASE_LOOP_OPERATOR_PASSWORD` from local `.env`. The mode toggle changes navigation; it does not grant permission by itself. Other teammates set their own password locally and restart.
- Use **Exit company operations** before switching back to the customer journey. On smaller screens, use the company mode control and navigation links below the header.

Six imported challenge returns are examples, not duplicates of your lease. Existing local records were preserved during the integration; no reset is needed.

## 1. Quote and sign as the customer

Choose an available asset, a valid term and down payment, complete the questions and sign. Open **My leases**. Check the asset ID, signed rent and dates.

The read-only invoice forecast explains net rent, invoice-date VAT and calendar dates. It is separate from issued invoices and does not record payment.

## 2. Simulate completion

In My leases, click **Demo: finish this lease**, then confirm. This development-only action advances your own lease to its agreed end date. It does not mark payment, physical receipt or readiness.

The lease opens automatically and shows Return, Pass on and Buyout with explanations. Company All operations also provides invoice generation and demo completion controls after operator sign-in.

## 3. Send a return request

Choose **Return my item**, enter the current usage in the return form, and click **Send return request**. Merely selecting the end option is not the submitted request: finish the usage form.

The customer sees a pending return status. Arrange physical handover separately; the customer does not certify receipt or repairs.

## 4. See the company notification

Enter Company operations and sign in. The return notification bar shows the number of requests awaiting physical receipt. It updates every 15 seconds and when the browser regains focus. Open **Return notifications** to see the request queue and the matching asset.

Imported returns and items already received do not count as new customer requests. Replaying the same request does not duplicate it. A refresh failure is displayed, not reported as an empty queue.

## 5. Receive, inspect and repair

Confirm physical receipt against the request only when the actual item has arrived. Its notification clears, but the item stays in Returned while processing.

Save the inspected condition and usage reading. Perform and confirm the required work. For a fair e-bike with 18,400 km, the example upgrade, battery and safety work totals €515.00.

Completion saves **PENDING_APPROVAL**. The asset remains unavailable and retains its allocation. Low-value items go to pricing review without an offer.

## 6. Approve, then lease again

Review the proposed price. Approval atomically publishes one offer, releases the allocation and records reviewer/date. Rejection requires a reason and keeps the item unavailable. Rejected proposals cannot currently be edited/resubmitted.

Exit company operations, select Lena and lease that same available item. Verify distinct contract/lease IDs with the same asset ID/serial. Original terms and invoices remain unchanged. Company All operations can generate the next invoice and display the passport.

## Smart checks and limits

- Compare December 2026 and January 2027 in the forecast: net rent stays fixed; the challenge’s fictional VAT changes from 25.5% to 26%.
- Inspect a January 31 lease’s February dates and due dates, including leap year 2028.
- Return requests follow the explicit simulated lease timeline, so a demo completed in 2029 can request return in 2029 without changing the computer clock.
- No payments are fabricated. Password sessions and customer switching are development identity, not production accounts. Visual mobile/keyboard QA still needs a manual pass.

See [PROGRESS.md](PROGRESS.md) and [PITCH-OUTLINE.md](PITCH-OUTLINE.md).

## Fresh test after approval-date fix

The local test database has been cleared and the 30 original assets restored. Restart the development server and reload before testing. Repair and review buttons now use the item’s saved lifecycle dates, including future demo dates. Choosing an end option is followed by the usage/return-request form; submit that form to notify the company.

## Invoice browsing and PDF

Company All operations generates one next invoice per click. In the customer view, open Transactions to filter saved invoices by asset. Click an invoice number to view/download its PDF. The customer can access only their own invoices. Forecasts remain separate from issued invoices; neither implies payment.

## Try the five smart problems

- **Price/tax:** open a signed lease and check the saved price-list version. Expand the forecast: compare the December/January VAT panel and unchanged net rent.
- **Early exit:** on an ACTIVE lease choose early return. Set completed months (6 means the start of month 7), calculate, read remaining rent/cap/net/VAT/gross and date, then confirm only if you want to persist termination. Creating a preview leaves the lease active. Future issued invoices require credits first.
- **Matching:** inspect an item in Company operations. Before confirming repairs, read estimated as-is/restored values, work costs, incremental uplift and candidate ranking. Complete required work and approve before the next lease.
- **Questions:** change customer type or financed amount while applying; check that irrelevant questions/answers disappear. Read why-we-ask and the localized decision reason. Do not override a known PEP/signing-authority flag.
- **Calendar:** inspect forecast rows for short-month and leap-year dates, payment due dates and separate net/VAT/gross totals. Forecasts are not issued invoices or payments.

Full explanation: [SMART-PROBLEMS.md](SMART-PROBLEMS.md).
