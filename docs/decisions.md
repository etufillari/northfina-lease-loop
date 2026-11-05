# Decision log

Every product, domain and engineering decision, in the order it was made. It is the source for the pitch, so a decision is logged in the same PR as the change.

**Adding an entry:** take the next `D-NNN`, add a row to the index and write the entry below. Never rewrite an old entry: mark it `Superseded by D-NNN` and add a new one. Each entry covers context, decision, alternatives, why, consequences and evidence (bugs caught, test results) where they apply.

## Index

| ID    | Date       | Area        | Decision                                                                           |
| ----- | ---------- | ----------- | ---------------------------------------------------------------------------------- |
| D-001 | 2026-11-05 | Strategy    | Build in the fork; the starter's tooling and conventions win                       |
| D-002 | 2026-11-05 | Pricing     | Rent comes from the coefficient table, not our own annuity model                   |
| D-003 | 2026-11-05 | Product     | Smart Problems: 1 (VAT), 5 (money adds up), 6 (explain my price)                   |
| D-004 | 2026-11-05 | Product     | No agent or MCP integration                                                        |
| D-005 | 2026-11-05 | Domain      | One rounding rule: `roundHalfUp`, half away from zero, noise-proof                 |
| D-006 | 2026-11-05 | Testing     | Expected values come from hand calculations, never from the code                   |
| D-007 | 2026-11-05 | Testing     | `src/domain` held to 90 % coverage, above the 60 % project gate                    |
| D-008 | 2026-11-05 | Workflow    | Protected `main`: every change is a squash-merged PR with green CI                 |
| D-009 | 2026-11-05 | CI          | CI pinned to `ubuntu-24.04` for the hackathon                                      |
| D-010 | 2026-11-05 | Workflow    | Rebase-merge PRs so every small commit stays in the history                        |
| D-011 | 2026-11-05 | Pricing     | A quote is net; VAT is added at the rate on each invoice date                      |
| D-012 | 2026-11-05 | Pricing     | Down payment in 10 € steps, bounded so the financed amount fits the table          |
| D-013 | 2026-11-05 | Pricing     | Follow the table at band edges, even when more down raises the rent                |
| D-014 | 2026-11-05 | Contract    | Signing locks a valid quote; a cheaper price today is offered, never forced        |
| D-015 | 2026-11-05 | Domain      | Dates are ISO strings; calendar maths in UTC in one module                         |
| D-016 | 2026-11-05 | Invoices    | Bill on the start day in full months; the billing rule is frozen per contract      |
| D-017 | 2026-11-05 | Testing     | Property-based tests prove every schedule adds up exactly                          |
| D-018 | 2026-11-05 | UI          | The sliders run the domain pricing in the browser; the server prices again to sign |
| D-019 | 2026-11-05 | Contract    | A signed item becomes `reserved`; the contract is stored as a frozen JSON snapshot |
| D-020 | 2026-11-05 | Audit       | `withAudit` can build its entry from the result, so new rows are audited by id     |
| D-021 | 2026-11-05 | Pricing     | The band hint looks for the next band up, not just one slider step back            |
| D-022 | 2026-11-05 | Application | Answers that stop applying are set aside: never shown, sent or decided on          |
| D-023 | 2026-11-05 | Application | Affordability uses the highest monthly total over the whole term                   |
| D-024 | 2026-11-05 | Application | Only an approved applicant who may sign can sign; the server decides again         |
| D-025 | 2026-11-05 | Application | Reasons and "why we ask" are translated in the app, not the data pack              |
| D-026 | 2026-11-05 | UI          | "Second Life" visual design with swipeable category rows                           |
| D-027 | 2026-11-05 | UI          | One photo per category in the picture slot, contained on a matching backdrop       |
| D-028 | 2026-11-05 | Application | A decline shows as soon as an answer breaks a rule, not when the form is complete  |
| D-029 | 2026-11-05 | Contract    | End of term: buy, return, or pass on to a named next lessee                        |
| D-030 | 2026-11-05 | Demo        | A validated "as of" date cookie is the app's only source of today                  |

---

## D-001 · Build in the fork

- **Context:** Before kick-off we prepared a separate repo with workflow tooling and a pricing engine, planning to merge the starter into it. The starter's README requires the submission to be a pull request from a fork.
- **Decision:** All work happens in our fork. We use the starter's stack as it is: npm, Node 22, Next.js 16, Prisma with SQLite, its hooks, CI and conventions. From the prep we carry over habits and small helpers only.
- **Alternatives:** Merge the starter into the prep repo (wrong direction for a fork PR). Port our stricter tooling (pnpm, Node 24, a fixed commit-scope list) on top (churn for no product gain).
- **Why:** The judges run the starter's checks. Fighting them costs time and points.

## D-002 · Rent from the coefficient table

- **Context:** Our prepared engine priced leases as an annuity down to a residual value. The data pack defines rent as `financed amount × factor`, with the factor picked by amount band and term, and a buyout as a percentage of the financed amount.
- **Decision:** Pricing follows `data/coefficient-table.json` exactly. The prepared annuity engine is dropped.
- **Why:** The worked example in `data/DATA.md` and the scenario cards are defined against the table. A bank trusts its own price table over our model.
- **Consequences:** The prep lesson that sliders must only offer valid quotes still applies: terms are 12/24/36/48 months, and the down payment must keep the financed amount inside a band.

## D-003 · Smart Problems 1, 5 and 6

- **Decision:** Go deep on 1 (lock the price, not the tax), 5 (money that adds up) and, as a lighter third, 6 (explain my price).
- **Alternatives:** 4 (question flow) is needed for the Spine anyway, so it gets a solid but not deep version. 2, 3 and 7 are left for later if time allows.
- **Why:** 1 and 5 both live in the invoice schedule, which the Spine needs regardless, and both reward rigorous testing (scenario cards 3 and 4, property-based tests). 6 reuses the price breakdown that the quote and contract pages show anyway.

## D-004 · No agent or MCP integration

- **Context:** We considered an MCP server as the wildcard, so a dealer's or bank's AI assistant could request quotes.
- **Decision:** Not built.
- **Why:** Letting an external agent act on financing data raises security and legal questions in banking that a hackathon can't answer responsibly, and it blurs the "no AI in the product" rule.

## D-005 · One rounding rule

- **Context:** The data pack leaves rounding to us. Floating point turns some exact halves into values just below them: 163 845 × 0.7 is 114 691.49999…, and 1.005 € × 100 is 100.49999…, so plain `Math.round` rounds them down. This bit us twice during prep.
- **Decision:** `roundHalfUp` in `src/domain/money.ts` trims the value to 6 decimals, then rounds half away from zero. Every rounding point (rent, VAT, buyout) uses it, once per amount.
- **Alternatives:** Banker's rounding (unusual on consumer invoices). A decimal library (another dependency for one function).
- **Why:** One rule, written once, tested once. Away from zero means a credit note mirrors the invoice it cancels.
- **Evidence:** Tests pin the worked example from `DATA.md` (rent 10 730.176 → 10 730, VAT 2 736.15 → 2 736) and both float-noise halves.

## D-006 · Independent expected values

- **Decision:** Every expected number in a test comes from the data pack's worked example, a hand calculation or a textbook value, noted next to the assertion. Tests go through each module's public functions, not its internals.
- **Why:** A test that recomputes the answer the same way as the code can never fail. Testing at the public seam lets us refactor freely.

## D-007 · Higher coverage bar for the domain

- **Decision:** `vitest.config.ts` keeps the project-wide 60 % gate and adds 90 % lines, functions and statements and 85 % branches for `src/domain`.
- **Why:** The domain holds the money. CI fails as soon as a business rule ships untested.

## D-008 · Protected main

- **Status:** Merge method superseded by D-010.
- **Decision:** `main` on the fork only changes through pull requests with a green `ci` check, squash-merged so each feature is one conventional commit.
- **Why:** The submission PR shows our whole history. One green commit per feature reads cleanly, and a broken `main` is impossible.

## D-009 · CI pinned to ubuntu-24.04

- **Context:** GitHub started moving `ubuntu-latest` to Ubuntu 26.04 in October 2026, overlapping the hackathon.
- **Decision:** The CI job runs on `ubuntu-24.04`.
- **Why:** The runner image can't change under us between our last push and judging.

## D-010 · Rebase merges keep the small commits

- **Context:** D-008 chose squash merges out of habit. The starter's rules say small, frequent commits tell the judges our story, and the README says the history shows who built what. Squashing collapses each PR into one commit and hides the test-first red, green, refactor steps.
- **Decision:** PRs into the fork's `main` are rebase-merged. Squash and merge commits are turned off in the repo settings. `main` stays protected with a required green `ci` check and linear history.
- **Alternatives:** Squash (one tidy commit per feature, but the story is lost). Merge commits (keeps commits but breaks linear history).
- **Why:** Every commit already passes the hooks and commitlint, so each one is safe to land on `main` as it is.

## D-011 · A quote is net; VAT follows the invoice date

- **Context:** Smart Problem 1. The net rent is locked at signing, but Finnish VAT rises from 25.5 % to 26 % on 1 January 2027 (`data/vat-rates.json`).
- **Decision:** `quoteLease` returns only net amounts: financed amount, band, factor, monthly rent, buyout and totals. `vatRateOn(rates, date)` and `withVat(net, rate)` in `src/domain/vat.ts` add VAT for a given date, rounded once per amount (D-005). The buyout is left out of the total cost because buying is optional.
- **Alternatives:** Store a gross rent in the quote (wrong as soon as the rate changes during the lease).
- **Why:** The same net rent produces 13 466 cents gross in 2026 and 13 520 in 2027. Keeping VAT out of the quote makes that impossible to get wrong.
- **Evidence:** Tests pin both VAT boundaries (2024-08-31/09-01 and 2026-12-31/2027-01-01) and the DATA.md worked example.

## D-012 · Down-payment slider bounds

- **Context:** The data pack sets no down-payment rule, only that the financed amount must fit a band (300 € to 250 000 €).
- **Decision:** The down payment moves in 10 € steps (`DOWN_PAYMENT_STEP_CENTS`, in `src/domain/pricing-rules.ts`). `downPaymentBounds` allows from max(0, price − 250 000 €) rounded up to a step, to price − 300 € floored to a step. `quoteLease` accepts exactly those values.
- **Alternatives:** A fixed cap such as 30 % of the price (our prep rule, but nothing in the data supports it).
- **Why:** The slider can never produce a quote the API would refuse.
- **Evidence:** A test sweeps every step for six prices and checks the bounds and `quoteLease` agree. The data-pack traps fall out of it: farm-006 (260 000 €) needs at least 10 000 € down; ebike-010 can't be leased on 5 Nov (289 €) but can on 6 Nov, when price list v2 makes it 303 €, with no room for a down payment.

## D-013 · Follow the table at band edges

- **Context:** The factor drops at each band edge. Financing 200 000 cents costs 5 517 a month over 36 months (band B), but 199 999 cents costs 5 725 (band A). So 0.01 € more down payment raises the rent by 2.08 €. laptop-002 and laptop-003 sit on exactly this edge.
- **Decision:** Price strictly by the table. The price explanation (Smart Problem 6) will tell the customer when a smaller down payment would move them into a cheaper band.
- **Alternatives:** Quietly charge the cheaper of the two bands (deviates from the bank's own table).
- **Why:** The table is Northfina's pricing. Our job is to apply it faithfully and make the effect visible.
- **Evidence:** A test pins both sides of the edge.

## D-014 · Signing locks the quote; a cheaper price is offered

- **Context:** Scenario card 2. laptop-004 is quoted on Thu 5 Nov at 349 000 (price list v1) and signed on Fri 6 Nov, when v2 makes laptops 8 % cheaper (321 100).
- **Decision:** A quote records its price-list version, the coefficient table and every amount, and stays valid for 7 days (`QUOTE_VALID_DAYS`). Signing a valid quote copies it into a frozen contract. Before signing, `priceCheckAtSigning` re-quotes the same terms for today: if the rent would be lower, the customer is offered the new quote; if higher, the quote protects them.
- **Alternatives:** Always price on the signing day (simpler, but a quote becomes meaningless). Lock the quote silently (customer overpays 770 a month on card 2 without knowing).
- **Why:** A quote is a promise the customer can rely on, and a bank shouldn't profit from a customer not noticing a price drop. Comparing the monthly rent, not the list price, keeps it right at band edges (D-013).
- **Consequences:** The contract stores where every number came from, so the UI can explain the locked price. An expired quote can't be signed; the customer gets a fresh quote.
- **Evidence:** Card 2 test: locked at 9 627/month (v1), offered 8 857/month (v2), saving 770.

## D-015 · ISO dates and one calendar module

- **Decision:** Dates travel as ISO strings (`YYYY-MM-DD`). Arithmetic lives in `src/domain/calendar.ts` and runs in UTC. An impossible date such as 2026-02-30 throws, because it can only come from a bug.
- **Why:** UTC can't lose or gain a day to time zones or daylight saving. The invoice schedule (31st starts, leap years) will build on the same module.

## D-016 · Start-day billing, frozen per contract

- **Context:** Smart Problem 5 and scenario cards 3 and 4. When is an invoice due for a lease starting on the 15th or the 31st, and is the first month a full month?
- **Decision:** Contracts store a billing rule, frozen at signing like the price. The first rule, `start_day_full_months`, bills in advance on the start day each month. In a shorter month it moves to the last day (31 Jan → 28 Feb, 29 Feb in 2028) and returns to the 31st afterwards, because every date is counted from the start, never from the previous invoice. Every invoice covers a full month at the same net rent. The invoice date is the due date, and VAT follows it (D-011). `invoiceSchedule` in `src/domain/invoicing.ts` is the only code that decides invoice dates.
- **Alternatives:** Bill on the 1st with prorated first and last months. It's tidier for a bank's billing run and shows more rounding work, but it costs more time today and is harder to explain on a first bill.
- **Why:** Same bill every month is the easiest thing for a customer to trust, and the total adds up by construction. Storing the rule per contract means a second rule (billing on the 1st) can be added later without touching signed contracts.
- **Evidence:** Card 4: due 28 Feb 2026, back on 31 Mar, and 29 Feb 2028. Card 3: the net rent stays 6 957 while VAT moves from 1 774 (Dec 2026) to 1 809 (Jan 2027).

## D-017 · Property-based tests for the schedule

- **Decision:** `fast-check` (dev dependency only) generates random contracts: any start day from Sep 2024 to 2030, any term, any rent up to 10 000 €. For each, the tests check one invoice per month, contiguous periods without gaps or overlaps, net total = rent × term, gross = net + VAT on every invoice, totals equal the sum of the invoices, and the VAT rate matches the year.
- **Why:** The brief calls property tests the gold standard for Smart Problem 5. They test rules that any billing rule must keep, so a future proration rule must pass the same suite.
- **Evidence:** Each property runs on 100 random contracts per test run, in CI on every push.

## D-018 · One rulebook in the browser and on the server

- **Decision:** The item page's sliders call `quoteLease`, `bandEdgeHint` and `withVat` directly in the browser, so the price updates on every move without a server round trip. Signing posts only the choices (asset, customer, term, down payment) to `POST /api/contracts`, which loads the data pack and prices from scratch.
- **Alternatives:** An API call per slider move (slower, more moving parts). Trusting the price the browser sends (a tampered request could sign any price).
- **Why:** The domain is pure, so the same tested code runs on both sides and can't disagree. The server never trusts numbers from the browser.

## D-019 · Signing reserves the item; contracts are frozen snapshots

- **Context:** The starter's asset statuses are available, reserved and returned. There is no "leased".
- **Decision:** Signing flips the asset from `available` to `reserved` in the same transaction as the contract and its audit row. The flip only succeeds while the asset is still available, so two simultaneous signings can't both win. The contract is stored once as JSON (`terms_json`) with a few copied columns for lookups, and is validated against a schema when read back.
- **Alternatives:** A new `leased` status (more schema, data and translation changes for the MVP). Columns for every contract field (more migrations each time the contract grows).
- **Why:** The item disappears from the leasable list at once, and a contract row is never updated after signing, which matches D-014.
- **Evidence:** Server tests on a real SQLite database cover the reservation, the second signing being refused, and nothing being written when signing is refused.

## D-020 · Audit entries can depend on the result

- **Context:** `withAudit` took its entry before the change ran, but a new contract only gets its id inside the transaction.
- **Decision:** `withAudit` also accepts a function `(result) => entry`. Existing calls are unchanged.
- **Why:** The audit row names the contract it created (`contract 1`), not just the asset.

## D-021 · The band hint searches the next band up

- **Context:** Found while trying the app in the browser: laptop-003 with 20 € down costs 56.68 €/month, but 55.17 € with none. The first hint only compared one slider step back (10 € down, still the dearer band), so it said nothing.
- **Decision:** Within a band, less down payment always means more rent, so the only cheaper option is the next band up. `bandEdgeHint` finds the largest down payment on a slider step that keeps the financed amount in that band and offers it if the rent is lower.
- **Evidence:** A test for the exact browser case was red, then green.

## D-022 · Answers that stop applying are set aside

- **Context:** Smart Problem 4. Changing an earlier answer (company → consumer, "can you sign?" no → yes) or moving a price slider (under 10 000 € the PEP questions vanish) makes some answers irrelevant.
- **Decision:** `askedQuestions` walks the bank in order and counts a condition on an earlier answer only if that answer's question still applies, so a stale answer can never switch another question on. `relevantAnswers` drops the rest. The form keeps what the person typed, but a set-aside answer is never shown, sent or decided on, and comes back if its question does. A note tells the person when answers they saw were set aside.
- **Alternatives:** Delete them (annoying when a slider moves back). Keep evaluating them (a leftover "other" country would decline a company).
- **Evidence:** Tests for the customer-type switch, the signatory email, the PEP threshold and a stale "other" country. A test also pins that the bank only refers to earlier questions, which one pass depends on.

## D-023 · Affordability over the whole term

- **Context:** The rule caps a consumer's rent incl. VAT at 30 % of net income. A lease signed in 2026 runs into the 26 % VAT of 2027 (D-011).
- **Decision:** The check uses the highest monthly invoice total from the schedule, not today's. Exactly 30 % passes. It applies only when income was asked (from 2 000 € financed), as the question bank implies.
- **Why:** A rent that's affordable in November but not in January isn't affordable.
- **Evidence:** Sanna's cargo bike over 12 months is 379.07 € a month at 26 %, over her 270 € cap, so it's declined, and the reason suggests a longer term.

## D-024 · Signing needs an approved applicant who may sign

- **Decision:** `POST /api/contracts` takes the answers and the server decides the application again on the deal being signed. It signs only an approved application whose applicant may sign. Declined, manual review (any politically exposed person) and "a signatory must sign" (card 6) are refused with their own codes. A new applicant who isn't a data-pack persona is recorded by their email.
- **Consequences:** Manual-review applications and signatory hand-offs aren't stored yet; the UI explains the next step instead.

## D-025 · Translations for reasons and "why we ask"

- **Context:** The data pack has question texts in four languages but `why_we_ask` only in English, and the rules engine returns reason codes.
- **Decision:** `why.<question>`, `option.<question>.<value>`, `outcome.*` and `reason.*` live in the app's message files in all four languages; the English text from the data pack is the fallback. Reasons are written to be kind and say what to do next ("You can apply from 10 March 2027").

## D-026 · "Second Life" visual design with swipeable category rows

- **Context:** The first UI worked but looked like a default Tailwind page. The user collected references (VibeMe AI on Awwwards: dark, cinematic, horizontal rows of picture cards) and wanted products you can swipe through and click into, without the look getting in the way of pricing and signing. Three clickable mockups were made (Showroom, Fjord, Second Life); the user picked Second Life.
- **Decision:** Dark ink-blue base with a paper-white light mode, one coral accent, Unbounded for uppercase headings and prices, Instrument Sans for body text (both self-hosted through `next/font`, with `latin-ext` for Estonian and Finnish letters). The catalogue opens with a hero and shows one swipe row per category: native CSS scroll-snap, arrow buttons with translated labels, and the whole card as one link. Every card and item page shows which life the item is on (previous leases + 1), so circularity is visible at a glance. Colours are semantic CSS variables (`bg-surface`, `text-muted`, `bg-accent`) that switch with the colour scheme, and shared pieces (`btn-primary`, `panel`, `field`, `range`, `eyebrow` utilities; `SwipeRow`, `CategoryArt`, `StatusBadge`, `LivesMeter` components in `src/components/ui/`) are there for new pages such as the application flow.
- **Alternatives:** Showroom (closest to the reference, but generic) and Fjord (calm light marketplace). A JavaScript carousel library (more weight, weaker keyboard and touch behaviour than native scrolling). Stock photos (licensing risk, mixed look); a coloured tile with a line drawing per category stands in until the user's own images are ready.
- **Why:** Second Life puts the product's point, items living more than once, into the design itself, which matters for the product and pitch scores. Native scroll-snap feels smooth on touch and trackpads, and keyboard users reach every card with Tab. Semantic tokens keep dark mode in one place instead of a `dark:` twin on every class.
- **Consequences:** Visual only: no change to pricing, signing, data or API code. Product photos can replace `CategoryArt` later without changing card layout. The build downloads the two fonts once from Google; the browser never contacts Google.
- **Evidence:** Checked catalogue → item → sign → contract → audit in the browser in light and dark, at desktop width and 400 px, in all four languages, with no horizontal overflow and no console errors. `npm run check:all` passes.

## D-027 · Category photos in the picture slot

- **Context:** D-026 left `CategoryArt` as a line-drawing stand-in for product photos. We now have three studio photos: e-bike, laptop and tractor.
- **Decision:** One photo per category, not per item, served from `public/images/` as WebP (about 1000 × 750, 17–27 KB each, down from 340–420 KB JPEGs). `CategoryArt` shows the photo with `next/image`, contained and not cropped, on a tile coloured like the photo's own backdrop. The photo is decorative (`alt=""`) because the make and model sit beside it.
- **Alternatives:** A photo per item (the dataset has none and the card layout would not change). Cropping to the tile shape (cut the bike in half in the portrait card).
- **Why:** The slot already gave every card the same shape, so swapping its content changes no layout. Contain plus a matching backdrop works for both the portrait card and the wide detail tile.
- **Consequences:** Visual only. All items in a category share one picture, so a per-item photo needs an `image` field on the asset later.
- **Evidence:** Checked the catalogue rows and an item page in the browser; format, lint, typecheck and 249 tests pass.

## D-028 · Decline as soon as an answer breaks a rule

- **Context:** Customer walkthrough (5 Nov): with a 2009 birth date nothing happened until the unrelated usage question was answered. `decideApplication` returned `incomplete` before checking any rule.
- **Decision:** Validate the answers, then check the decline rules (age, blocked answers, affordability) on the answers given so far. Any decline ends the application at once with its reasons; otherwise it stays `incomplete` until every question that applies is answered. Manual review (PEP) and approval still need the complete form. Extends D-022 and D-024; the server decides with the same function.
- **Alternatives:** A separate early check in the form only (the form and server would disagree). Keep waiting for the full form (the reported problem).
- **Why:** A question only depends on earlier answers (pinned by a test, D-022), so later answers can never un-ask the question that broke a rule: an early decline is final.
- **Evidence:** Tests for under-18 and a blocked country with later questions unanswered, affordability before the usage question, and an invalid answer still reported before a decline.

## D-029 · End of term: buy, return or pass on

- **Context:** Spine step 6 (issue #12). The challenge names three endings without defining "pass it on". The contract must stay frozen (D-019).
- **Decision:** The choice opens on the last invoice date (the start of the final month) and takes effect on the handover date, the day after the last period (`addMonthsClamped(start, term)`, so a 31 Jan start hands over on 31 Jan, D-016). A late choice takes effect on the day it is made.
  - **Buy:** the net buyout locked at signing, with VAT at the rate on the handover date (D-011). Card 1 ends in 2029: 583.50 € + 26 % = 735.21 €. The item becomes `sold`.
  - **Return:** condition and usage are recorded. Usage can't go down and condition can't be better than at delivery. The item becomes `returned` with the new readings.
  - **Pass on:** a return plus a named next lessee (a persona or an email, not the current customer). Second life (#14) gives that person first claim at the re-priced rent.
  - Every ending counts as a finished life (`previous_lives + 1`). The ending is its own `ContractEnding` row (one per contract), written with the asset change and the audit row (`contract.ended_<kind>`) in one transaction. The form runs the same domain function in the browser; the server decides again (D-018).
- **Alternatives:** "Pass on" as a straight drop onto the waiting list (barely different from a return), or as an immediate lease transfer (needs second-life pricing first). Storing the ending inside `terms_json` (breaks the frozen contract).
- **Consequences:** Until the demo date control (#9) exists, a contract signed today can only be ended from its final month, years ahead. Asset status gains `sold`.
- **Evidence:** 15 domain tests (card 1 and card 4 dates, leap-day start, VAT on either side of 2027, late choice, every refusal) and 8 server tests against SQLite (contract row unchanged, asset updated, audit row, double ending refused, nothing written on refusal). Checked in the browser on a backdated contract: buy preview 999.60 € + 25.5 % = 1 254.50 €, pass on to Sanna saved and shown in Finnish, audit row present.

## D-030 · A demo "as of" date is the app's only source of today

- **Context:** Issue #9. Every page and route called `todayIso()`, so from Fri 6 Nov the catalogue prices from price list v2 and card 1 no longer shows 107.30 €/month, cards 3 (start 15 Sep 2026) and 4 (start 31 Jan 2026) cannot be signed at all, and a lease can only be ended in its final month (D-029).
- **Decision:** `asOf()` / `asOfDate()` in `src/server/as-of.ts` are the single source of "today" for pages and routes. They read the `lease-loop-as-of` cookie and fall back to the real Helsinki date (`todayIso()`, which nothing else calls). `parseAsOfDate` in `src/domain/as-of.ts` (pure, tested) accepts only a real `YYYY-MM-DD` date from **2026-01-01** (the first price list) to **2035-12-31** (a 48-month lease signed in 2031 can still reach its end of term). A cookie that fails the check is ignored, never trusted. `POST /api/as-of { date }` validates and sets it (400 `INVALID_AS_OF_DATE` with the bounds); `DELETE /api/as-of` clears it. A "Demo date" menu sits in the header; whenever the effective date is not the real date, a banner on every page says so, shows the real date and offers "Back to today". `contract.signed` and `contract.ended_*` audit rows record the effective date as `details.asOf`; `created_at` keeps the real time.
- **Alternatives:** A query parameter (lost on every link, easy to forget in one route). A server-wide setting in the database (one judge's date would change everyone's; it is a viewer preference, not business data). A dedicated `as_of` audit column (needs a migration; only date-driven changes carry a date, so `details` is enough).
- **Why:** A cookie survives navigation and reaches pages and API routes alike, so the price shown and the price signed use the same day. One helper means no route can drift back to the real clock.
- **Consequences:** The cookie is `httpOnly`, `SameSite=Lax`, a session cookie, for this browser only. Setting it is not audited, since it changes no data; asset status changes have no date and carry no `asOf`. The layout reads it, so every page renders per request (the pages already did).
- **Evidence:** 10 domain tests (range ends, leap day, malformed input) and 6 server tests (cookie wins, Helsinki fallback, tampered cookie ignored); audit tests now assert `asOf`. Against the dev server: 2026-11-05 → ebike-003 107.30 / 134.66 (card 1); 2026-11-06 → price list 2 and the banner; 2026-09-15 → ebike-001 24 m starts 15 Sep 2026, invoices 87.31 and 87.66 (card 3); 2026-01-31 → laptop-001 36 m invoices due 28 Feb 2026 and 29 Feb 2028 (card 4); `2026-02-30` and `2040-01-01` refused. Set and cleared from the header in Finnish in the browser.
