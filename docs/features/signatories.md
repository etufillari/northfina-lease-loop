# Company signatories and the signing link

## What it does

Every company has a list of the people who may sign leases for it, each valid over a range of days, granted by another signatory or by the (simulated) register check, and revocable. When a company case waits for its signatory, a signing link goes to the named signatory: only that link signs or declines, which closes the hole where the coordinator who may not sign could approve their own case from the company's account.

## The rule

- **Validity is half-open.** A right holds from `valid_from` (inclusive) up to, not including, `valid_to`; an entry with no `valid_from` is waiting for its link and holds nothing. Revoking on a day sets `valid_to` to that day, so the right no longer holds that day. The last active signatory cannot be revoked (`last_signatory`): add another one first.
- **E-mails** are stored trimmed and lower case and compared that way (`Signatory@Norvi.example.com` is `signatory@norvi.example.com`).
- **The link.** When a case enters `awaiting_signatory` (straight from the rules, or after the admin approves a review that needs a signatory), a `SignatureRequest` is made in the same transaction: a 32-character token from `node:crypto` `randomBytes(24)`, sent on the request's day, working up to, not including, 14 days later (`REQUEST_VALID_DAYS`). An e-mail not on the list becomes an entry granted by `register_check_simulated` and waiting for its link.
- **Using it** (`signingCheck`): a link that was signed or declined answers `already_used`, whatever the day; one on or after its `expires_on` answers `expired`; an entry already in force must be active on the day (`signatory_not_active` after a revocation); an entry waiting for its link comes into force that day. The link, the entry and the case change in one transaction with one audit row, actor `signatory:<email>`, details `{ via: 'signing_link', signatoryRegistered }`.
- **Who changes the list.** The admin (the bank's back office, from the register), or the company's own account when the company's e-mail is an active signatory, who then grants the right. Norvi's coordinator may not sign, so may not grant either.
- **The seed** lists the company's own name and e-mail for every company whose applicant can sign (Kettu Koodi, Haapala, the broken-id company), granted by `register_check_simulated`, valid from the seed day; none for Norvi. It adds only what is missing.

**Card 6 worked.** Norvi Logistics (`cust-norvi`, `applicant_can_sign: false`) applies for one `ebike-004`, 549 000 financed, on 2026-11-05, answering can-sign **no** and naming `signatory@norvi.example.com`.

1. The rules give `awaiting_signatory` with `signatory_needed { signatoryEmail }`. In the same transaction the list gets `signatory@norvi.example.com`, granted by `register_check_simulated`, `valid_from` empty, and a link sent 2026-11-05, expiring 2026-11-19. The audit row of `application.created` says `signingLinkTo: signatory@norvi.example.com`.
2. The decision page shows the demo outbox: "A signing link was sent to signatory@norvi.example.com on 5 November 2026", with the link. On that page Norvi's account and the admin get 403 `NOT_SIGNATORY` if they post a decision.
3. The signatory opens `/en/sign/<token>` on 2026-11-06: Norvi Logistics, ebike-004, 36 months, the financed amount and the monthly rent, Sign and Decline. Sign: the case is `approved` with `signatory_decided { by: signatory@norvi.example.com, decision: approved, on: 2026-11-06 }`, the entry is valid from 2026-11-06, and the audit actor is `signatory:signatory@norvi.example.com` with `signatoryRegistered: true`.
4. The same link again answers 409 `SIGNING_LINK_USED`; on 2026-11-19 an unused one answers 410 `SIGNING_LINK_EXPIRED`.

## Decisions

- **D46** the signatory list and the signing link (this page).
- **D47** the admin applies on a customer's behalf with `onBehalfOf`, recorded in the audit (the wave 3 demo buttons).
- **D39** (narrows D10) only the link signs an `awaiting_signatory` case; **D38** can-sign, e-mail, income and revenue compared with the record; **D40** (narrows D17) who applies.

## Pure functions

```ts
// src/domain/signatories/mandates.ts
type Mandate = { id; email; validFrom: string | null; validTo: string | null };
normaliseEmail(email: string): string; // trimmed, lower case
activeSignatories(list: Mandate[], onDate: string): Mandate[]; // validFrom ≤ onDate < validTo
canSign(list: Mandate[], email: string, onDate: string): boolean;
revoke(list: Mandate[], id: string, onDate: string): // validTo = onDate
  { ok: true; mandate } | { ok: false; code: 'not_found' | 'already_ended' | 'last_signatory' };
requestExpiresOn(sentOn: string): string; // + 14 days
requestOutcome({ expiresOn, signedOn, declinedOn }, onDate):
  { code: 'pending' } | { code: 'expired'; params: { expiresOn } } | { code: 'already_used'; params: { outcome; on } };
signingCheck(request, signatory: Mandate, onDate):
  { ok: true; activates: boolean } | { ok: false; code: 'expired' | 'already_used' | 'signatory_not_active' };

// src/domain/question-flow/signatory.ts
whoDecides(decision): 'admin' | 'signing_link' | 'final';
```

Server (`src/server/signatories.ts`): `listSignatories(db, customerId, today)`, `seedSignatories(db, customers, today)`, `addSignatory`, `revokeSignatory`, `createSignatureRequest(tx, …)` (inside the transaction that enters `awaiting_signatory`), `latestSigningLink`, `getSigningLink`, `decideByToken(db, { token, action: 'sign' | 'decline', today })`.

Routes: `GET`/`POST /api/customers/[id]/signatories`, `POST /api/customers/[id]/signatories/[signatoryId]/revoke`, `GET`/`POST /api/sign/[token]` (`{ action }`). Refusals are `fail()` envelopes (`src/server/signatory-responses.ts`): 403 `NOT_ALLOWED`, 409 `LAST_SIGNATORY`, 409 `SIGNATORY_ALREADY_LISTED`, 404 `SIGNING_LINK_NOT_FOUND`, 410 `SIGNING_LINK_EXPIRED`, 409 `SIGNING_LINK_USED`, 403 `SIGNATORY_NOT_ACTIVE`.

## Files

- `prisma/schema.prisma` (`CompanySignatory`, `SignatureRequest`), migration `20261105212314_signatories`, `prisma/seed.ts`
- `src/domain/signatories/mandates.ts`, `src/domain/rows/signatory.ts`, `src/domain/question-flow/signatory.ts` and their tests
- `src/server/signatories.ts`, `signatory-schemas.ts`, `signatory-responses.ts`, the token path in `applications.ts` (`recordSignatoryDecision`)
- `src/app/api/customers/[id]/signatories/…`, `src/app/api/sign/[token]/route.ts`
- `src/app/[locale]/sign/[token]/` (the signing page), `src/app/[locale]/customers/[id]/signatories/` (the list, linked as "Who may sign for the company" from a company's portal, `src/app/[locale]/leases/portal.tsx`, on My leases and on the admin's customer page), the demo outbox on `src/app/[locale]/applications/[id]/page.tsx`

## Tests that pin the numbers

| What                                                                                        | Test                                                                               |
| ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `valid_from` inclusive, `valid_to` exclusive; the last active one; expired and used links   | `src/domain/signatories/mandates.test.ts`                                          |
| Card 6: the case waits, the link goes to the named e-mail, expires 2026-11-19               | `src/server/applications.test.ts` "the signing link (D39, D46), card 6"            |
| Signing approves, registers the signatory, audit actor `signatory:<email>`; decline rejects | same describe                                                                      |
| Norvi's account and the admin get `not_signatory`; a second use `already_used`; a race      | same describe; `applications.hardening.test.ts` "the signatory (D39, D46)"         |
| The routes: NOT_SIGNATORY on the decision page, the link signs, used 409, unknown 404       | `src/app/api/applications/route.test.ts`; `src/server/signatory-responses.test.ts` |
| The list: seed idempotent, add by the company, a stranger and Norvi refused, revoke, last   | `src/server/signatories.test.ts`                                                   |
| The admin on behalf (D47)                                                                   | `applications.test.ts` "D47: …"                                                    |

## Open questions

- **No e-mail is sent.** The link is shown in the decision page's demo outbox, to whoever opens the page; whoever holds it acts as the signatory. The decision page has no access check yet (finding 1 of [the wave 3 review](../reviews/wave-3.md)). Production replaces this with the e-mailed invitation and Suomi.fi strong identification on opening, and the list with the trade register and Suomi.fi e-Authorizations (a register check when an e-mail is named).
- **Amount limits per signatory** (two signatories jointly above a sum, as many companies' rules say) are not modelled.
- The seed day is the real day: on a demo clock before it, the seeded signatories are not yet valid.
- A second application naming the same e-mail reuses the entry; an entry that was revoked stays revoked, and its new link answers `signatory_not_active`. When the same e-mail has since been added again, the link still takes the ended entry: a defect, finding 3 of [the wave 3 review](../reviews/wave-3.md).
