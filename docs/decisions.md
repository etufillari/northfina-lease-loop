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
| D-031 | 2026-11-05 | Application | A named customer's answers must match their record, or signing is refused          |
| D-032 | 2026-11-05 | Second life | Waiting list: cheapest refurbishment wins, then deadline, sign-up order, id        |
| D-033 | 2026-11-05 | Contract    | Early exit settles what is still owed at the band's rate, minus item value         |

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

## D-031 · A named customer's answers must match their record

- **Context:** Issue #11. `signLease` only checked that a named `customerId` existed, then decided on whatever answers the browser sent. Choosing Mikko and changing his birth date to 1990 signed a contract for a 17-year-old (card 5); choosing Norvi and answering "yes, I can sign" skipped the signatory (card 6).
- **Decision:** When an application names a data-pack customer, the server compares the answers with that customer's record (`answersNotMatchingCustomer` in `src/domain/persona.ts`) before deciding the application, and refuses any difference with `ANSWERS_DO_NOT_MATCH_CUSTOMER` (422), listing the question ids in `details.questionIds`. Extends D-024.
  - **Facts on record:** every answer `answersFromCustomer` fills: customer type, name, birth date, email, country, employment, monthly income, business ID, company name, VAT registration, "can you sign for the company?", annual revenue, beneficial owners and PEP status.
  - **Applicant's own choice:** usage purpose, farm registry number, signatory email and PEP details. The record says nothing about them.
  - Only answers to questions that apply to the deal are compared (D-022), so a stale answer can't block signing. A missing answer is not a mismatch; the application stays incomplete. Text is compared trimmed, emails without case, lists item by item; a value that fails validation (Typo Trading's `1234567-8`) is compared as it is.
  - An applicant who names no customer is checked by the rules only, as before.
  - In the form, the chosen customer's known answers are read-only with "From the customer record"; starting with an empty form frees them. If the server still refuses, the form says the answers don't match the record.
- **Alternatives:** Overwrite the answers with the record on the server (hides the tampering and decides on answers the person never saw). Lock the form only (the API stays open).
- **Why:** A persona is a known customer; the record is the truth about them. Refusing with the list of differing questions is explicit and easy to show.
- **Consequences:** A persona whose real situation changed (new income, new email) can't sign as that persona; they apply as a new applicant until the record is updated.
- **Evidence:** 10 domain tests (Mikko's birth date, Norvi's can-sign, mismatch order, customer-type switch, answers that no longer apply, missing answers, spacing and email case, the invalid business ID, money sent as text) and 5 server tests against SQLite (Mikko and Norvi refused with no contract, audit row or asset change; Aino still signs; a non-persona applicant with the same answers signs; unknown customer checked first).

## D-032 · Waiting list: who gets a returned item

- **Context:** Smart Problem 3 and card 9 (issue #15). ebike-007 is back in fair condition with 18 400 km. wait-02 and wait-13 have the same budget (9 000/month) and deadline (2026-11-10); wait-02 accepts fair for 12 months, wait-13 needs good for 24. wait-06 and wait-14 are identical except that wait-14 signed up a day later, and the data has no sign-up date. Second-life valuation (#14) is not built yet.
- **Decision:** `src/domain/refurbishment.ts` plans the refurbishment, `src/domain/waiting-list.ts` matches. The rent comes in as a function of (condition, term), so #14 plugs its valuation in without changing the matcher.
  - **Refurbish:** every fixed cost whose rule applies (data order), then one upgrade per condition step up to the entry's minimum, never down. `fair` is the floor (the data: `good` unless the entry accepts `fair`). No service history, so a farm machine's hours all count as "since last service". An unknown rule throws rather than guessing a cost.
  - **Eligible:** same category (the list has no model field); ready on or before `needed_by`; the condition reachable; rent at most the budget (equal passes). An excluded entry gets every reason that applies: `category_mismatch`, `deadline_passed`, `condition_unreachable`, `no_price`, `over_budget`.
  - **Rank** (lower wins on each key): (1) total refurbishment cost to us, (2) earliest `needed_by`, (3) earliest sign-up = position in `second-life-demand.json`, (4) request id. Each match records the first key that put it ahead of the next one, so the UI can say "wins on deadline".
- **Card 9 answer:** refurbish only what the item needs (battery 350 €, since 18 400 ≥ 15 000 km, plus safety inspection 45 €; no condition upgrade) and lease it to **wait-02** at 64.97 €/month for 12 months. wait-13 is second: same budget and deadline, but serving them needs a 120 € fair->good upgrade. With the provisional valuation (below) the full order is wait-02, wait-13, wait-04 (same cost as wait-13, later deadline), wait-03 (+80 € to like_new); wait-01 (55.56 € > 45 €) and wait-05 (84.96 € > 35 €) are over budget. wait-06 beats wait-14 on sign-up order.
- **Alternatives:** Deadline first (would spend upgrade money on an urgent entry while someone who takes the item as it is waits). Highest rent or longest term first (favours the bank's income over fit; wait-13's 24 months is not a reason to upgrade an item wait-02 takes as it is). Random or "first in the list" only (not explainable on the two card 9 entries). One-key-only ranking (leaves ties to input order).
- **Why:** The item goes to the person it already fits. That saves an upgrade, gets it out sooner with fewer steps before a close deadline, and keeps better-condition items for people who need them. The fixed costs are the same for every entry, so the cost key only compares condition upgrades. The id makes the order total, so the same list always gives the same answer.
- **Consequences:** #14 must supply `rentFor(condition, term)` (whole cents) and the date the item is ready. The card 9 test pins rents from a provisional valuation, worked by hand: first-lease price = the model's v1 price 549 000, age from 1 Jan 2023 to 6 Nov 2026 = 46 months (curve 32.5 %), no usage deduction after the battery, financed = market value; fair 12 m = 6 497, good 24 m = 5 556. If #14 decides otherwise, those rents change but the ranking does not (both stay within 9 000).
- **Evidence:** 12 refurbishment tests (card 9 both ways, poor->good chain, the 15 000 km edge, laptop-007, farm-005 with 5 started thousands, unreachable `new`, unknown rule, wrong unit) and 13 matching tests (card 9 ranking and exclusions, exact budget and deadline edges, one step below the minimum, every reason listed, nobody eligible, wait-06/wait-14 in either input order, full tie on id) plus two fast-check properties: the result never depends on input order, and every entry is ranked or excluded exactly once.

## D-033 · Fair early exit: settle what is still owed, valued today

- **Context:** Smart Problem 2, scenario card 8 (issue #13). Aino (card 1: ebike-003, 36 months, 107.30 € a month, buyout 583.50 €, band B) ends the lease in month 7. The data pack gives the band's `annual_interest_percent` "if you want to discount money over time" and the residual curves for market value. The answer must be fair to both sides, explainable line by line, and equal the end-of-term buyout (D-029) in the final month.
- **Finding:** The coefficient table is exactly an annuity at the band's interest rate, rents paid at the end of each month, with the buyout at the end. Band A, 12 months at 9.9 %: 0.056022 × 11.3807 + 0.40 × 0.90611 = 1.00001; card 1 at 7.9 %: 36 rents of 10 730 plus 58 350, discounted, are worth 388 992 against 389 000 financed (the 8 cents are the rent's rounding). So discounting at that rate is the bank's own pricing, not our invention.
- **Decision:** Leaving in month k (invoices 1…k paid) takes effect when month k ends, `addMonthsClamped(start, k)`. With r = annual % / 12 and T the term:
  - **Buy early** = the remaining rents and the buyout, each discounted to that day: rent n by n − k months, the buyout by T − k. The customer keeps the item (it becomes `sold`).
  - **Hand back early** = the same remaining rents, plus what the bank would get at the end (the buyout, or the item if it would be worth less: the customer's cheaper normal ending), discounted, minus what the item is worth now on the residual curve. Never below zero. The handed-back item is valued in its inspected condition and usage, which can't be better than at delivery (D-029's check).
  - VAT is added at the rate on the effective date (D-011). Every amount is rounded once (D-005). The ending is a `ContractEnding` row of kind `early_buy` or `early_hand_back` with every line of the price, written with the asset change and the audit row in one transaction; the contract row is untouched (D-019).
- **Card 8 (month 7, effective 5 Jun 2027, worked by hand):** 29 rents of 107.30 € = 3 111.70 €, worth 2 824.27 € today; the buyout 583.50 € is worth 482.39 €. **Buy early: 3 306.66 € + 26 % VAT = 4 166.39 €**, which is 388.54 € less than paying everything on schedule. The bike is worth 3 112.00 € now (80 % of 3 890 € at 7 months) and would be worth 1 556 € at the end, more than the buyout, so at the end Aino would have bought it. **Hand back early: 2 824.27 + 482.39 − 3 112.00 = 194.66 € + VAT = 245.27 €.**
- **Alternatives:**
  1. _All remaining rents at face value_ (common in consumer leases): 3 111.70 € for a bike she gives back. The bank is paid twice, by her and by the next lessee, and charged interest for months it has its money back.
  2. _Remaining rents + buyout, discounted_ for both endings (the issue's first option): fair for buying, but handing back would cost as much as buying while the bank keeps a 3 112 € bike.
  3. _Hand back credits the item's value against the value the bank would get back at the end_ (bank-neutral against a return at term): 998.64 € here. It treats the 1 556 € bike as the bank's, but Aino holds a 583.50 € buyout option on it, so it charges her for an option she'd use.
  4. _A flat fee plus N months:_ simple, but arbitrary, unrelated to the item or the month, and it doesn't converge to the buyout.
- **Why it's fair:** The bank is exactly as well off, in today's money, as if the customer had stayed and taken their cheaper normal ending; it never earns interest on money it already has back. The customer pays no interest for unused months and gets full credit for what the item is worth today. Buying early and handing back early differ by exactly the item's value now (when it would beat the buyout at the end), so neither choice can be gamed against the other.
- **Properties (fast-check, random contracts priced from the real table, every exit month):** neither price is ever negative and handing back never costs more than buying; buying out gets cheaper every month; rents paid plus the exit price never fall the longer you stay (within 3 cents of rounding: three amounts rounded once each); the final month equals the D-029 buyout invoice exactly and handing back is free.
- **Consequences:** The contract page has a month slider, so card 8 can be shown on any date as a what-if; confirming is only possible for the current month (the demo "as of" date, D-030). Market value uses the contract's locked list price and, for used items, an age counted from 1 January of the model year (the data has no first-use date). Refurbishment costs are not deducted, because a normal return doesn't charge them either. After any ending, the contract page and `GET /api/contracts/:id` show only the invoices dated before its effective date (`billedBefore`); the rest are listed as cancelled, because the ending settled those months. Card 8 keeps invoices 1–7 (945.32 € with VAT) and cancels 29; a full-term ending cancels none.
- **Evidence:** 20 early-exit tests and 8 market-value tests (card 8, month 1 at 25.5 % VAT, month 2 at 26 %, the final month against `buyoutInvoice`, an item worth less than the buyout at the end, the zero floor, before the start, after the term, a missing VAT rate), 4 properties, 4 server tests against SQLite (contract row unchanged, asset sold or returned with its inspection, audit row, second ending refused, nothing written on refusal). In the browser on a production build: month 7 showed 4 166.39 € and 245.27 €; a hand-back confirmed in month 1 recorded 34.93 € + 8.91 € VAT, also in Finnish, with no console errors.
