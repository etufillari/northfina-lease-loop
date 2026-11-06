# Dealer next actions

In Dealer mode, open **Needs attention** and expand **Items needing attention**.
The list groups one next action per physical item. Signing blockers come first,
then preparation, then published offers that have reached their ready date.
Item IDs provide stable ordering within each group.

## Records and boundaries

- A signing entry requires a saved manual-review application with a named-signatory
  handoff, a still-valid offer in the current release revision, no signed agreement,
  and an item that remains available for that applicant. Duplicate applications for
  the same offer count once. The dealer sees only a count and next-step explanation,
  not customer answers, email addresses, application IDs or offer IDs.
- A returned item links to the existing preparation form. Return status does not
  establish collection, completed inspection, safety certification or repair completion.
- A published next-lease offer appears when its ready date arrives and the item has
  no active lease. The offer details retain any reservation; a new customer still
  needs to qualify and sign. Ordinary new catalogue stock is not an attention task.
- Expired offers and future applications are excluded. Stored current status is not
  reconstructed when rewinding the demo date; a future recorded return is hidden.
- Existing demo Dealer-mode checks protect the API boundary. The selector simulates
  a role and is not production authentication or organisation-level authorisation.

The list is read-only and requires no migration. Refreshing, expanding or following
a link writes no business records. Publishing refreshes the list through the existing
dealer reload; **Refresh list** retrieves changes made elsewhere. Errors remain in
the dealer error panel with its existing retry action.

## Demo

1. Open `/en/lease/ebike-007` on a disposable seeded demo and select Dealer mode,
   with demo date `2026-11-06`. Expand the attention list and choose **Prepare item**.
2. Confirm the required work and publish a valuation using the existing form.
   The same item changes to **View offer** in the list. Open it to inspect the
   published price and any reservation. Signing a new agreement removes the entry.
3. For the signing example, select Norvi in Customer mode on `ebike-004`, use
   `2026-11-06`, a 36-month term and EUR 500 upfront. Submit an application with
   the company's authorised-signatory email. Switch to Dealer mode: the item has
   a **View signing status** entry. The page explains the handoff without exposing
   private answers or adding a dealer approval shortcut. Moving beyond the offer's
   validity removes the entry. The demo sends no emails and implements no delegated signing.
4. Check another locale and use the keyboard to expand the list and follow a link.
   Green/Northfina and light/dark styles use the same shared controls and records.

Domain tests cover priorities, dates, reservations, revisions, active leases and
privacy. Server tests use migrated isolated databases and the real GET handler.
The optional UI smoke script includes opening the list by keyboard, following a
preparation link, refreshing without writes, mobile reflow and an automated axe scan.
Run the full quality gate with `npm run check:all`; the UI smoke is a separate check.

## Validation record

Verified the feature working tree based on `028124b` on 6 November 2026:

- `npm run check:all`: formatting, lint, types, file-size, no-AI and coverage passed;
  1,072 repository tests passed. The build initially could not fetch the existing
  theme's Google Font under restricted network access. Retrying only `npm run build`
  with network access succeeded. Next.js still reports the existing font-fallback warning.
- `node scripts/check-ui-smoke.mjs`: all four short scenarios passed using installed
  Edge, a local production server on port 3107 and a separately migrated, seeded
  temporary database. This includes the new dealer scenario, mobile keyboard/reflow,
  Northfina dark mode, locale/draft preservation and automated axe checks.

These checks are not a full screen-reader, zoom or WCAG conformance certification.
