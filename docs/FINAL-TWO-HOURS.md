# Final two hours

## Current fetched baseline

Team main: `92db65e` (includes PRs 15–19). Latest dashboard, My leases, saved assets and company demo-operator changes are pulled locally. Customer leases are now under `/en/leases`; `/en/account` is account information.

Company approval and separate development operator sign-in are implemented locally on top of this baseline. Customer My leases no longer displays engine mutation controls. Production staff accounts remain future work. Transactions currently links to the catalogue; a separate transactions/invoice-printing branch exists but is not merged in this baseline.

## UI test now (15 minutes)

1. Run `npm run dev` and open `/en`. Select Aino using the demo user switcher.
2. Choose an available asset, complete its questions, sign and open My leases. Confirm asset ID, locked rent and saved invoices.
3. Sign in to the workshop to generate invoices and use Demo finish lease. Return to My leases and choose Return. Find the same asset ID in the workshop.
4. Register physical receipt, inspect condition/usage, tick completed mandatory work, then submit for approval. Verify it remains unavailable, approve the proposal, then check price and availability. Submit the customer usage form to create a return request and verify the company notification before physical receipt. An item outside finance bands must remain unavailable for review.
5. Switch to another eligible customer and lease that same available asset. Check the new contract/lease and the old passport history.
6. Repeat navigation at mobile width. Check language switching, keyboard buttons, saved assets and errors. Automated rendering checks do not replace this visual test.

Do not clear the database: existing user data is preserved.

## Next 45 minutes — deepen two smart problems

Prioritize smart problem 1 (locked price versus invoice-date VAT) and problem 5 (money/calendar correctness). The calculations and tests already exist; verify the UI can demonstrate the challenge dates, and add a clear invoice comparison/explanation if needed. Do not add a new finance engine.

The approval gate and API permission checks now have regression tests. Avoid concurrent edits to the circular workflow while preparing the demo.

## In parallel with implementation — prepare the pitch

Use [PITCH-OUTLINE.md](PITCH-OUTLINE.md) for five short slides, a four-minute script and Q&A. One teammate can prepare slides while the developer tests; this file does not mean work has been assigned automatically.

## Final 60 minutes

- 30 min: finish the selected UI explanations and repeat the chosen scenario cards.
- 15 min: run `npm run check:all`, review changes and ensure the submission PR targets the required repository per README.
- 15 min: freeze feature work and rehearse twice, including a fallback if the live demo fails.
