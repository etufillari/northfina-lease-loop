# Spine implementation policies

These are explicit reference-implementation choices, not additional organiser rules.
Record the team's accepted choices in its decision board before changing these defaults.

## Money and time

- Store money as integer cents. Factors use millionths; percentages use basis points.
- Multiply with integer arithmetic and round a nonnegative half-cent upwards.
- Monthly net rent is rounded once. Total rental net is that amount times the term.
- Use the supplied price literals and coefficient bands. Do not add another APR formula.
- A down payment is a net advance, not a refundable security deposit.
- Advance and buyout have separate invoices, taxed on their actual issue dates.
- A term has N full rental periods, starting at month offsets 0 through N minus 1.
- Anchor every date to the original start day; clamp it within each target month.
- End date is start plus N months. There is no hidden extra invoice.
- No first-period proration; invoice date and due date coincide in this reference.
- Forecast dates are intentions. An overdue invoice issued today keeps its original
  scheduled date, but its issue date, due date and VAT follow the explicit business date.
- Gross forecasts combine immutable issued documents with estimates for unissued periods.

## Offer, application and signature

- One asset means one physical item, not several copies of one serial number.
- A stored offer expires after seven calendar days or at its start date, whichever is earlier.
- A quote made on 5 November for signature on 6 November must start on 6 November or later.
- Preserve the stored offer's net terms and source when signing; do not silently reprice.
- A quote does not reserve an asset. Signing atomically claims its unique active lease.
- Combine authoritative synthetic profile facts with applicable validated answers.
- Remove inactive answers without erasing known facts such as PEP status.
- Missing or contradictory information cannot produce an automatic approval.
- Assess affordability against gross rent at the agreed start date. This is not an
  affordability stress test against every future tax rate.
- Manual review does not become approval without a separate authorised review workflow.
- A company application awaiting another signer retains the signer's email and stays
  unsigned and inactive. Show the recipient and next step; this demo does not send email
  or implement delegated signing.
- Repeating the same command returns its original result; reusing its key with a different
  payload is a conflict. A deliberate new offer receives a new key.

## End of term and reuse

- Buy, return and pass-on require maturity and all N rental invoices to have been issued.
- Issued does not mean paid; payment collection is outside this Spine.
- Early exit is explicitly unsupported until a separate pricing policy is implemented.
- Buy creates a separate buyout invoice and removes the item from further availability.
- Return and pass-on close the old agreement. The next customer needs a new agreement.
- Pass-on nominates a successor and reserves the next offer for that synthetic customer.
- Relisting requires all tasks derived from the supplied refurbishment data.
- The operator records a net valuation and its reason. This is not a matching optimiser.
- For imported history, the organiser's approved valuation reference is price list v1
  and 1 January of the model year. Label assumptions; retain real dates and prices for
  subsequent app-generated leases without resetting the original valuation baseline.
- Preserve cumulative physical usage. Record replacement/service baselines separately.
- A release revision prevents an old command from reopening a later lifecycle.
- Preserve imported previous-life counts, but do not invent their missing records.

## Boundaries

- Use the starter API envelope and atomic withAudit helper. Every business write uses tx.
- Scope private records to the selected synthetic persona. The public passport omits
  former customers, agreement IDs, answers and money.
- Demo persona, role and business-date selectors are simulations, not authentication.
- Continue the starter UI, use four locale dictionaries, and keep domain functions pure.
- Generate schema migrations with Prisma CLI. Never write migration SQL by hand.
- The complete submission still needs at least two deliberately selected Smart Problems.

## Independent example

For ebike-003 on 2026-11-05, 36 months, zero advance: 389000 cents uses band B and
factor 27584 millionths. Exact rent is 10730.176 cents; rounded monthly net is 10730.
At 25.5% VAT the tax is 2736 and gross is 13466; at 26% they are 2790 and 13520.
Rental net is 386280. A schedule starting that day has two old-rate periods and
34 new-rate periods: projected rental gross is 486612. Net buyout is 58350.
Its projected 2029 gross is 73521, so projected ownership total is 560133 cents.
Actual later invoice issue dates can change the gross forecast; they never change net rent.
