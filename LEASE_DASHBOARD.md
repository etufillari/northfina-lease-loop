# Lease dashboard

The signed-in account provides an overview, lease details, issued invoices,
recorded payments, a timeline, and requests to return, buy out or exchange an item.
Profile and security settings are under `/[locale]/account/settings`.

## Try the demo

Run `npm run db:setup`, start `npm run dev`, register or sign in, and use
“Explore a demo lease” on the empty dashboard. The demo uses the synthetic data
pack; its lease, invoice and payment are marked as simulated. It does not change
asset availability or take money. Demo creation is enabled only in development.

Real customer contracts do not exist in the starter checkout yet. The demo is
an opt-in preview; it does not create a real agreement.

## Integrating checkout and invoicing

- A `User` owns a `Customer`; future applications and contracts reference
  `Customer.id`. Use `requireIdentity` and its `customerId` for every read and
  write. A caller cannot choose the owner or audit actor.
- Persist a `Contract` with the asset, customer, start date, term, locked net
  amounts, price list version and `isDemo: false` after the actual application
  and signing flow authorizes it. Use `withAudit()` and its `tx` for all writes
  in the same change, including the asset's availability. Do not infer a signed
  contract from a catalogue click or from the demo.
- `startDate` is the first invoice date. The schedule preserves its day of month,
  clamping February and other short months to the last day. All amounts are
  integer euro cents. VAT is rounded once per invoice, half up.
- Future invoices in the dashboard are forecasts based on rates at the expected
  due date, not issued invoices. The invoicing flow must create `Invoice` rows
  with the actual issued-date VAT snapshot when an invoice is issued. Once issued,
  its stored net amount and VAT are displayed instead of recalculated values.
- Create `Payment` records only for confirmed payments. `isSimulated` must be
  true for simulated payments. Simulated amounts count only on demo leases;
  they never increase a real lease's paid total. No payment gateway or payment
  recording UI is included.
- Customers can submit a single pending `LeaseRequest` for return, buyout or
  exchange. It leaves the current contract and asset unchanged. A staff review
  and fulfilment flow is still needed before these requests can be completed.
- The passport displays current item data and the number of previous lives. Its
  reuse estimate assumes one refurbishment, applies a condition discount, and
  uses the fictional factors from the data pack. A complete prior-life history
  requires recorded events; do not expose previous customers' personal data.

## APIs

`GET /api/leases` and `GET /api/leases/:id` return only the signed-in customer's
leases. `POST /api/leases/:id/requests` accepts `{ "kind": "return" | "buyout" |
"exchange" }`, checks the request origin and owner, and creates the request with
an audit row. `POST /api/leases/demo` is available only in development. Each API
uses the standard response envelope.

## Co-lease

An active lease can be shared from its detail page. The holder picks people and whole-percent shares that total exactly 100 %; each person's amount comes from dividing the invoice's total in whole cents, with leftover cents going to the largest remainders and ties to the holder first. A change applies to invoices due from that day, and earlier invoices keep their split. Next payment and invoice lists show the holder's share.

This version is a demo. Participants are seeded dummy accounts that are not invited, credit-checked or charged, the holder stays responsible for the whole contract, and returns, buyouts and exchanges are unaffected. The people show initials rather than photos.
