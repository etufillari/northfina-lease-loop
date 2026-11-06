# Questions for the mentors

Three readings of the brief we took in code and asked the organisers about on Friday; all three are answered (issues #13 and #54 closed, D60). D31 is a stated assumption (below). For each: what they said and what the code does.

Not a question here: Thomas's question-flow validation (#25, merged) added four rules (D37 to D40: the birth-date range, answers checked against the customer record, only the named signatory signs, only the acting customer applies). They are listed for information; the scenario suite on `main` passes with them.

## 1. Fleet quantity: answered (D8, issue #13 closed)

**Answered by the organisers on 2026-11-06.** Every item is unique; card 6 is 1 × `ebike-004` and is about the signing flow; quantities and multi-item contracts are not needed. Johannes decided: no multiples in the UI or the API.

**What the code does now.** A quote prices one item: no quantity in `POST /api/quotes`, `GET /api/quotes/preview` or the price page, no per-item split. Card 6 is 549 000 financed, band B, 15 144 a month, and ends `awaiting_signatory` because the applicant may not sign. An item below the smallest lease is not leasable on that list (D78, replacing D41's "two together"). The `quantity` column stays at 1, and signing still refuses a larger one (D76) for rows stored before the answer. Our earlier reading (the band on the fleet's total, band C at 58 993) is in D8's history.

## 2. Pass on: answered (D16, issue #54)

**Answered by the organisers on 2026-11-06.** "Pass it on" means the item goes straight to a new user, who starts its second life on a new lease priced on its used value; that person can be someone from the waiting list or someone the customer names, and the details are the team’s choice.

**What the code does.** Pass on names the next customer (the picker, standing in for an e-mail invitation), and refuses without one (`pass_on_needs_next_customer`), with yourself (`next_customer_is_self`) or an unknown id (`next_customer_not_found`). The waiting-list route is "return": the item is assessed and matchmaking (D13) names the next customer. A waiting-list entry has no customer record in the pack, so it cannot apply or sign itself. Both exits share the assessment (D77), the first contract ends `passed_on` (or `ended_early` before its end, D32 to D35), the second-life price is D12 on D60 and D83, and the passport chains the lives (D66). The mapping is in [issue #54](https://github.com/ThomasParratt/northfina-lease-loop/issues/54).

## 3. Second life: answered (D60, D83)

**Their follow-up of 2026-11-06, 10:35, on the battery (D83, replaces D79).** `resets_usage: true` resets both the usage adjustment in the market value and the next-replacement trigger. Two numbers: the total usage never resets (passport, circular impact); the usage since the last battery replacement is 0 after it (the value's usage adjustment, the next battery at 15 000 km or 500 cycles). Their example: 92 781 before the battery, **115 976** with it, 151 661 also good. Card 9 was then 115 976 + 39 500 = 155 476 (D12), `wait-02` at 8 710 a month; since D86 the price is the market value alone, **115 976**, `wait-02` at **6 497** a month for 12 months; the earlier D79 answer is the last paragraph of this section.

**Answered by the organisers on 2026-11-06.** For an item with past lives in the pack, the price at its first lease is its price on list 1, and its age counts from 1 January of its model year. Their worked example values `ebike-007` on 6 Nov 2026 at 927,81 €, with its usage counted.

**What the code does now (D83, D86).** D60 was already that reading of the price and the age. The new battery resets the usage adjustment, so card 9 is valued with none: 549 000 × 32.5 % × 0.65 = **115 976**, and since D86 that value is the second-life price, nothing added (the 39 500 of work is our cost; their "compare that gain with what it costs" is the refurbish-or-not test on the page): `wait-02` at **6 497** a month for 12 months ([second-life.md](features/second-life.md)). When the app leases an item again, the contract stores the real start day and price, so the next life has its own history.

**The earlier answer, replaced by D83.** D79 (Johannes) read their example as "the value is taken as returned": a new battery was a cost in the price and did not lift the value (D68 replaced). Card 9 was then 549 000 × 32.5 % × 0.65 × 0.80 = 92 781, + 39 500 = 132 281, `wait-02` at 7 411 a month. The organisers' follow-up above replaced it.

## Not a question any more: card 8's curve age (D31)

Decided by Johannes on 2026-11-06 as an assumption and stated in the README "Status" section: the pack has no first-lease date, so a first life is aged from its lease start and an item with previous lives from 1 January of its model year (D11). It is not asked as a question, but it may not hold for a real item, so the other reading stays pinned in the tests and the switch is one line.

**The reading.** The pack has no first-lease date. Every pack item is new on the shelf, so a first life is counted from its lease start; an item with previous lives keeps D11 (whole months from 1 January of the model year). It gives the brief's number.

**What the code does today.** Card 8's `ebike-003`, valued on 2027-06-05, is 7 months into its lease: 80 % on the curve, **311 200** as new (the brief's number), 259 230 as good with 1 800 km. The return costs 330 675 − 311 200 + 4 500 = **23 975** as new, 75 945 as good. `curveAgeInMonths` in `src/domain/residual/age.ts` picks the rule.

**If the answer differs.** With D11 for every item the bike is 17 months old (model year 2026): 62.5 %, 243 125 as new and **202 523** as good with 1 800 km; the return is 92 050 as new and 132 652 as good. The change is one line in `curveAgeInMonths` (return `ageInMonths` for every item); `market-value.test.ts` already pins both numbers, and the card 8 rows in the README "Status" table and in [exits.md](features/exits.md) change with it.
