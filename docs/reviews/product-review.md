# Review: the whole product before submission

_Written 2026-11-06 by a review session (Opus), read-only, on `main` at `b7817d1`. Time box 90 minutes. No code was changed; every finding is for the code round._

## Scope and method

The per-slice reviews (`wave-0.md` to `wave-3.md`) each looked at one slice. This one follows the money and the dates through every slice at once, and walks the data pack for the traps an unknown scenario card could bring.

What ran:

- `npm run setup`, `npm run db:setup`, then `timeout 600 npx vitest run`: **130 files, 1 497 tests, all green** (38 s). That is the baseline: no finding below is caught by a failing test today.
- Two small `tsx` probes (written into `src/`, run, deleted, nothing committed) to put numbers on finding 1.
- Greps, each over `src/` without tests and `src/generated`:
  - `Math\.(round|floor|ceil)|parseFloat|toFixed|new Date|Date\.now|Math\.random` in `src/domain`;
  - every `(db|tx).<model>.` access in `src/server` and `src/app`, grouped by file and model (team rule 3);
  - a counted script over every `withAudit(` call that searches the callback's body for `db` (a write beside the `tx`): **0 hits**;
  - `(status|kind|decision|outcome): '<literal>'` in `src/server` (D23);
  - `.message` and `stack` in `src/app/api` and `api-response.ts`;
  - every date field in the request schemas (`*-schemas.ts`, `routes.ts`) and every `searchParams` read in the routes;
  - every writer of `auditLog`.
- Two read-only helper agents: one on the data-pack traps (brief section 3), one on the pages with a counted message-key script (section 5). Every finding of theirs below was checked against the code by reading the lines named.

**Not repeated here, in progress in the `fix/authz` session:** the wave 3 review's open findings 1, 3, 4, 6, 8 and 10 to 13 (the decision page's access check, `createSignatureRequest`'s ended entry, `matchedDemandIds` outside the transaction, the ungated demo runner, "Applied on", the unparsed application id, `MAX_ANSWERS`, the signatories route comment, the income ceiling).

## Findings

Most severe first. "Card" is a scenario card of `CHALLENGE.md`; "D" a row of `docs/decisions.md`.

### 1. high: an exit of a relisted item values it from its second-life price, aged again from the model year

**Status:** fixed in `fix/product-review`: the exit and the assessment read one D60 rule (`firstLeaseCurve`, `src/domain/second-life/first-lease.ts`); card 9's early return on 2027-11-06 starts from 549 000 at 58 months (121 329 as good, 92 781 as the fair it was leased in, D77), card 10's preview from 179 900 (`src/server/scenarios/relisted-exit.test.ts`).

- **Where:** `src/server/exit-data.ts:90` passes `contract.unitListPriceCents` to `src/domain/exits/early-exit.ts:128` as the curve's list price; `src/domain/residual/age.ts` (`curveAgeInMonths`) then ages any item with `previous_lives > 0` from its model year.
- **What is wrong:** for a contract on a relisted item, `unitListPriceCents` is the D12/D63 second-life financed amount (the quote's price is replaced by the assessment's), which is already a depreciated value. The exit multiplies it by the curve at the item's full age a second time. D60 says the curve starts from the "net list price at its first lease" (the first contract's price, or the earliest price list) — which is what `src/server/second-life.ts:97-112` does, and the exit does not.
- **Reproduce:** run card 9 (`ebike-007` relisted good, 203 161), lease it, return it early on 2027-11-06 (age 58 months, good, 0 km). The exit shows a market value of **448,99 €**; by D60 (549 000 × the same curve) it is **1 213,29 €**. The return bill is **764,30 € net too high**. Card 10's contract (`ebike-008`, `previous_lives` 2) is valued the same way, so an exit preview on it shows the same error.
- **Fix:** give the exit the D60 inputs: move `firstLeaseListPriceCents` and the "ours from new" rule from `second-life.ts` into one shared read and use it in `planInputOf`; a card 9 → lease → early return test pinning the value.

### 2. medium: an exit trusts the customer's reported condition and usage, and the assessment relists on them

**Status:** fixed in `fix/product-review` (D77): the exit bills and records the worse of the reported condition and the one at signing, refuses a usage below the one at signing (`usage_below_signing`), and the assessment takes the admin's inspection in an optional body `{ condition?, usageValue? }`.

- **Where:** the exit body (`src/server/exit-schemas.ts:33-39`) → `src/server/exits.ts:82-86` → `early-exit.ts:126-150`; `returnLeasedAsset` (`src/server/catalogue-handlers.ts:61-85`) writes them onto the asset; `POST /api/assets/[id]/assessments` reads no body and `src/server/second-life.ts:107-108` assesses the stored values.
- **What is wrong:** `early-exit.ts`'s comment says "the assessment (wave 3) checks it", but the assessment takes the customer's word. A usage below the one at signing is accepted too.
- **Reproduce:** return a fair bike at 18 000 km with `{ "mode": "return", "condition": "new", "usage": { "unit": "km", "value": 0 } }`: the early-return cost takes the top market value and no upgrade or battery step, and the bike is relisted as new with 0 km.
- **Fix:** refuse a usage below the asset's usage at signing; let the admin's assessment take the inspected condition and usage in its body (defaulting to the reported ones), and price the return on the worse of the reported condition and the condition at signing until it does.

### 3. medium: `previous_lives` is the pack's count and never moves, but pages and the exit read it as the current life

**Status:** fixed in `fix/product-review`: the catalogue and the price page stamp `livesSoFar` (pack count + our ended contracts, `src/server/asset-lives.ts`); the exit ages an item ours from new from its first lease on every later lease (`firstLeaseCurve`). The version picker reads the same assets.

- **Where:** no code writes `previous_lives` (grep: only reads). Read as "this life" at `src/app/[locale]/assets/[id]/page.tsx:162-164`, `src/components/model-card.tsx:69-71`, `src/components/version-picker.tsx:44-46`, and by the exit's curve age (`exit-data.ts:97`).
- **What is wrong:** after card 8 returns card 1's `ebike-003` (pack `previous_lives` 0) and it is assessed and relisted, the catalogue and the price page still stamp it **"Life 1 · New"**, while its passport counts two lives. On its second lease the exit ages it from the second lease's start (D31 sees 0 previous lives), so it is valued as a new item again, on top of finding 1's price.
- **Fix:** one read, "lives so far" = `previous_lives` + this asset's ended contracts (the passport already folds them), used by the stamp, the version picker and `curveAgeInMonths`.

### 4. medium: an admin's manual status change can pull an asset from under an active contract

**Status:** fixed in `fix/review-phase2` (coordinator): by hand only `available` ⇄ `reserved` (`checkManualAssetStatusChange`, 409 `transition_by_event_only`); an exit on an asset that is no longer leased answers 409 `asset_not_leased`.

- **Where:** `PATCH /api/assets/[id]/status` (`src/server/routes.ts:80-82`, `src/server/assets.ts:89-97`) allows every D22 transition, including `leased → returned` and `available → leased` (`src/domain/catalogue/transitions.ts:7,9`).
- **Reproduce:** `PATCH /api/assets/ebike-003/status {"status":"returned"}` while card 1's contract is active; assess it; it is relisted and a second customer can lease it. Aino's exit then throws `AssetNotLeasedError` in the handler, which `exitContract` does not map (`src/server/exits.ts:178` catches only its race), so she gets a generic 500. An item can also be set `leased` with no contract.
- **Fix:** by hand only `available ⇄ reserved`; `leased`, `returned`, `sold` only through the events; map `AssetNotLeasedError` to a coded 409.

### 5. medium: the decision form and the signing-link form turn every refusal into one generic error

**Status:** fixed in `fix/review-phase2` (coordinator): both forms write the sentence for the error code (`src/components/api-failure.ts`, the authorization code in `details` first), keys in all four files.

- **Where:** `src/app/[locale]/applications/[id]/decision-form.tsx:30`, `src/app/[locale]/sign/[token]/sign-form.tsx:27`: `if (!response.ok) throw …`, then `labels.error`.
- **What is wrong:** the API answers with codes (`APPLICATION_NOT_PENDING`, `SIGNING_LINK_EXPIRED`, `SIGNING_LINK_USED`, `SIGNATORY_NOT_ACTIVE`, `ADMIN_ONLY`) and the page drops them. A judge who decides twice, or opens a used signing link (card 6's second click), sees "something went wrong" instead of "already decided" or "this link was used".
- **Fix:** read `error.code` from the envelope and map it to message keys in all four files, as `signatory-forms.tsx` already does.

### 6. medium: the business-id hint is the data pack's English on every language

**Status:** fixed in `fix/product-review`: `apply.hint.finnish_business_id` in the four files, the pack's text only as the fallback.

- **Where:** `src/components/question-flow.tsx:421` shows `question.validation.hint`, which is `data/questions.json:232`'s "1234567-8 with a valid check digit".
- **Reproduce:** apply as a company or sole trader on `/fi/…`, `/sv/…` or `/et/…`: the hint under the business-id field is English.
- **Fix:** a key per validation format (`question.hint.finnish_business_id`) in all four files, the pack's text only as the fallback.

### 7. low: a farm machine's major service counts lifetime hours, so a second return bills it again

**Status:** fixed in `fix/product-review`: per-started blocks count from `usageAtLastService`, the usage of the newest assessment that did the step; farm-005 returned again at 4 500 h bills one major service.

- **Where:** `src/domain/refurbishment/plan.ts:82` (`Math.ceil(usage.value / rule.block)`).
- **Reproduce:** `farm-005` returned at 4 200 h, leased again, returned at 4 500 h: both returns bill 5 major services (750 000 c); the second should bill 1. Already an open question in `docs/features/exits.md:110`; listed because "an item returned twice" is a likely surprise card.
- **Fix:** record the hours at the last service (the assessment's usage) and count blocks from there.

### 8. low: a cast message key that is missing crashes the page instead of showing the key

**Status:** fixed in `fix/product-review`: `getT` returns the key itself for a missing message.

- **Where:** `src/i18n/get-t.ts:24` (`interpolate(dictionary[key], values)` calls `.replace` on `undefined`), reached through `t(\`${prefix}.${code}\` as MessageKey, values)`at`src/app/[locale]/demo/card-steps.ts:82`and`src/components/exit-preview.tsx:48`.
- **What is wrong:** today every code has its key (the counted script below), so nothing breaks; a new server code without its key takes the demo page or the exit preview down.
- **Fix:** `interpolate` returns the key when the template is missing (and logs it), or both callers check with `isKey` first.

### 9. low: `payInvoice` answers "already paid" for a cancelled invoice, writes its literals unparsed and never checks `paid_on`

**Status:** fixed in `fix/review-phase2` (coordinator): `cancelled` (409 `INVOICE_CANCELLED`) and `paid_before_signing` (422) refusals, the day and both statuses parsed before the write.

- **Where:** `src/server/invoices.ts:136` and `:156-171`.
- **What is wrong:** a cancelled rent (after an exit) falls through to the conditional write, finds nothing and answers `INVOICE_ALREADY_PAID`. `'issued'` and `'paid'` are written without `invoiceStatusSchema.parse` (D23; the exit handler does parse them), and the update bypasses `parseRow`, so with the demo clock moved back a rent can be paid before its contract was signed.
- **Fix:** an `invoice_cancelled` refusal; parse both statuses; refuse a `paid_on` before the contract's `signed_on`.

### 10. low: moving the demo clock back lets a contract be signed before its quote existed

**Status:** fixed in `fix/product-review`: `quote_not_yet_valid { quoteDate }` in `planContract` (after D76's check) and in `createApplication` (409 `QUOTE_NOT_YET_VALID`); the apply page says it up front.

- **Where:** `src/domain/pricing/quote-status.ts:38` (`today <= validUntil` is "valid", with no lower bound), `src/domain/contracts/sign.ts:97-118`.
- **Reproduce:** quote on 2026-11-05, set the clock to 2026-10-01, sign: the contract's `signed_on` is before its `quote_date`, and its invoice 0 is dated a month before the quote.
- **Fix:** `quote_not_yet_valid` when `today < quoteDate` (and the same lower bound on an application's day).

### 11. low: the audit chain cannot see a deleted last row

**Status:** fixed in `fix/product-review`: `withAudit` keeps an `AuditHead` row (count and newest hash) in the same transaction; the verifier answers `head_mismatch` for a deleted newest row or a missing head. Rewriting both tables is still not caught (`docs/features/audit-chain.md`). An existing database needs `npm run db:reset` after the migration.

- **Where:** `src/domain/audit/chain.ts:62-75`; the head is shown but not kept anywhere outside the table.
- **What is wrong:** deleting the newest row (or the newest N) leaves a valid chain; the file's comment says so ("anchoring the head outside the database answers"), but the anchoring is not built and no test names the case. A judge running `npm run demo:tamper` with a delete of the last row would see "intact".
- **Fix:** for the pitch, say it; in code, keep the head hash with its row count in a second place (a file written by `withAudit`, or the demo page prints it to copy) and compare.

### 12. low: smaller gaps from the data-pack walk

**Status:** partly fixed in `fix/product-review`: the waiting-list tie-break compares ids by number; one `MAX_QUANTITY` (100) for the page and the API. In `fix/review-followups`: a company's residency is checked on its record country (`recordCountry`; DE is refused). Not fixed: the application's age on today (signing re-checks the start day, D45, so nobody under 18 signs; the only cost is that Mikko cannot apply early for a lease starting on his birthday), signatory date bounds (only an admin or an active signatory can add one), the fleet quote on a relisted item (needs issue #13; D76 refuses signing more than one unit, so it never reaches a contract).

- **Application age on today, not the start** (`src/server/applications.ts:209`, `startDate: input.today`): Mikko (card 5) cannot apply for a lease that starts on his 18th birthday, although signing allows a start up to 12 months ahead and re-checks the age on it. Fix: take the planned start into the application, or say in D45 that the application is on today's age.
- **No residency check for a company** (`src/domain/question-flow/eligibility.ts:108`, `answers.ts:147`): the country question is asked only of people and the company record's country is not passed in; a surprise company in `DE` is approved. Signatories have no birth date, so a 17-year-old signatory is not detectable from the pack. Fix: pass the record's country for every customer type.
- **Two quantity caps**: the price page stops at 20 (`src/domain/pricing/financeable.ts:11`), the quote API at 100 (`src/server/quote-schemas.ts:12,20`). Fix: one constant. (Signing marks one asset row leased for any quantity: the known D8 question.)
- **Waiting-list tie-break on ids as strings** (`src/domain/second-life/match.ts:154`): fine for `wait-01` … `wait-99`; a surprise `wait-100` ranks before `wait-14`. Fix: compare with `localeCompare(…, { numeric: true })` or by the entry's position in the file.
- **Signatory `validFrom` / `validTo` unbounded** (`src/server/signatory-schemas.ts:26-27`): a mandate can be backdated. Only an admin or an active signatory can add one.
- **A fleet quote on a relisted item** prices every unit at that one item's second-life amount (`src/server/second-life-price.ts:27-33` replaces the asset's price, `quote.ts:170` multiplies it by the quantity).

### 13. low: rules the meta tests do not see

**Status:** fixed in `fix/product-review`: `resolveActor` reads through `listCustomers`; the reviewer is the cookie actor (the body's `reviewedBy` is ignored). In `fix/review-followups`: the Run button ignores a second click while its run is in flight. Not fixed: two tabs clicking at once (a server-side guard belongs in `src/server/demo-cards.ts`, which `fix/single-units` is editing).

- **A direct read of another slice's table:** `src/server/actor.ts:41` reads `db.customer.findMany` instead of the customers slice's read function (team rule 3). Every other access in the grep is in its owner's file.
- **`reviewedBy` from the browser:** `decision-form.tsx:28` sends it and `src/server/applications.ts:364` stores it after checking the cookie actor is admin. Fix: set it from the actor on the server.
- **Demo card double click** (`src/server/demo-cards.ts:177`, `earlierRun`): "already run" is a read before the work, so two quick clicks both quote and apply; the signing's conditional write lets one win and the other shows "signing refused: asset not available", leaving an orphan quote and application. Money is safe; the message is confusing in front of a judge.

### 14. low: pages

**Status:** partly fixed in `fix/product-review`: refusal params on the exit form, the contract's exit card and the second-life page; `SIGNATORY_NOT_FOUND` labelled; the seven unused keys removed; in `fix/review-followups`: `centsToEuroInput` in the domain for the question flow (English now writes ".") and the language switcher keeps the query string. Not fixed: the price page's own copy of the formatter (`quote-calculator.tsx` is `fix/single-units`' file; it already writes the right mark), the page sizes (all under 600; a refactor with no behaviour change, left to avoid conflicts before the freeze), "Ready to sign" on the portal (`src/app/[locale]/leases/*` is the portal's files).

- **Over 400 lines:** `src/components/question-flow.tsx` 465, `src/app/[locale]/assets/[id]/second-life/page.tsx` 461, `src/components/quote-calculator.tsx` 455, `src/app/[locale]/assets/[id]/page.tsx` 406 (under the 600 rule; split the step, the tables and the stored-quote section).
- **Logic in client components:** `quote-calculator.tsx:61-71` (`centsToInput`, `downPaymentStep`) and a duplicate `centsToEuroInput` in `question-flow.tsx:278-283` that writes "," even in English. Fix: one domain formatter with tests.
- **Refusal params dropped:** `src/components/exit-form.tsx:85`, `src/components/contract-exit.tsx:47`, `second-life/page.tsx:416` show the refusal's text without its `startDate`, `isoDate` or `status`. Fix: pass the params as `sign-refusal.ts` does.
- **`SIGNATORY_NOT_FOUND` has no label** on `customers/[id]/signatories/page.tsx:66-74`, so it shows the generic error.
- **"Ready to sign" on an expired quote:** `src/app/[locale]/leases/page.tsx:204-208` badges every approved application; the signing then refuses `quote_expired`.
- **The language switcher drops the query string** (`language-switcher.tsx:107`): `?quote`, `?down` and the catalogue filters are lost when the language changes.
- **Unused message keys (7):** `catalogue.intro`, `asset.previousLives`, `asset.listPrice`, `asset.priceListVersion`, `pricing.card.seePrice`, `pricing.line.band`, `decision.answers`; `catalogue.itemCount` is used only in a test.

## Checked and fine

- **Rounding:** every money rounding in `src/domain` goes through `roundHalfUpDiv` / `roundHalfUpDivBig` in `money-math.ts`. The other `Math.*` calls are calendar arithmetic (`civil-days.ts`, `dates.ts`, `passport.ts`), counts (`plan.ts`, `market-value.ts` steps), display-only percents (`market-value.ts:118`), the affordability floor (`eligibility.ts:86`, compared in whole numbers), the tolerance bound (`balance.ts:118`) and CO₂ kilograms (`co2.ts:88`, not money). `factorToMillionths` and `percentToBasisPoints` refuse a value they cannot convert exactly.
- **No clock in the domain:** no `new Date`, `Date.now` or `Math.random` in `src/domain`; pages call `todayForRequest()` once.
- **Market value in BigInt** (`market-value.ts:105-112`), one division. The D14 balance rounds once a month, away from zero for a negative balance.
- **Quote = invoices under one VAT rate:** `quote-schedule.property.test.ts:69-84` asserts the invoices' gross equals `totalIfReturnCents` whenever one rate covers the term; VAT is per line from the net (`splitVat`), the rate by the invoice's issue day, ranges inclusive (31 Dec 2026 25.5 %, 1 Jan 2027 26 %).
- **Calendar:** month-end clamps from the original day (`addMonthsClamped`, no drift: 31 Jan → 28/29 Feb → 31 Mar), leap day birthdays on 1 March, `termEndDate` the day before.
- **Writes inside `withAudit`:** the counted script found no `db` in any callback; the event handlers (invoices, catalogue, passport) take only `tx`. `auditLog` is written only by `withAudit` (and read by `scripts/tamper-audit.mjs`, which is the point).
- **Races guarded by a conditional write inside the transaction:** signing (the asset `available → leased` `updateMany` plus the unique `application_id`), a second decision (`updateMany` on the pending decision), two payments (`status: 'issued'`), two exits (`endContract` on `active`, and the handler's cancel `count`), two assessments (`relistReturnedAsset` on `returned`), a payment during an exit (the handler re-reads on `tx` and fails on a changed count). The only prior-read guard is the demo card's (finding 13).
- **Routes:** every route uses `handleRoute`; unknown errors become a generic 500; `ApiError` messages are our own strings. The only dates from the browser are the demo clock cookie and the signing's `startDate`, bounded from the signing day to 12 months ahead and age-checked (D45).
- **Data-pack traps handled generically:** band edges and one cent either side, min and max on both price lists, the broken business id, reserved / returned / leased / sold assets refused for a quote and a signing, every customer type through the flow, a 17-year-old consumer, a down payment equal to or above the price or negative, quantity 0 and 101, a term over the category cap, a quote across the price-list change (frozen, `priceLockOf`), a start on the 31st or a leap day, an exit on the start day, on the end day and after it, an exit before the start, an item returned twice (`contract_not_active`, `asset_not_returned`), the waiting-list twins (deterministic), a demand entry already expired or in the future, a laptop on the e-bike list. No card id is hard-coded outside the demo runner and the test fixtures.
- **Audit chain:** the hash covers actor, action, entity type and id, details and time: every column the audit page shows; the verifier accepts an empty table (genesis head, `chain.test.ts:86`) and a one-row table follows the same loop; nulling the hashes is caught.
- **Message files:** 700 keys in each of the four, 0 missing, 0 placeholder mismatches; 527 literal keys in code, 0 missing from `en.json`; the values equal to English are formats or the same word (`Status`, `Demo`, the brand). No hard-coded user text in JSX, `aria-label`, `title`, `placeholder` or `alt`. No server component writes during render; no `'use server'`.

## For the pitch

- Finding 1 is the one a judge's surprise card ("exit the second-life bike early") would put on screen with a wrong number; fix it first, or don't demo that path.
- After card 8 and an assessment, `ebike-003` still says **"Life 1 · New"** in the catalogue (finding 3) while its passport says two lives: a judge comparing the two will notice.
- Card 6's signing link opened a second time, or a second decision, shows a generic error (finding 5); say "the link is single-use" before clicking.
- The business-id hint is English on the Finnish page (finding 6).
- The tamper demo: edit or delete a middle row, not the last one (finding 11), and say plainly that anchoring the head is the next step.
- `CHALLENGE.md` problem 7 asks for "CO₂ **and money** saved"; `src/domain/second-life/co2.ts:14` leaves money out because the factors file has none. Say it in the pitch and point at the refurbishment cost against the new price as the money comparison, or show that number.
