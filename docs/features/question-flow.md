# The question flow and the application

## What it does

The applicant answers only the questions of `data/questions.json` that apply to their deal, one at a time, with "why we ask" for each; going back and changing an answer removes the answers that no longer apply and says so. An answer that cannot be true (a birth date in the future) is refused at the question, and an answer that differs from the customer record sends the case to a person. On submit, the eligibility rules give a clear yes, no, "a person will check" or "waiting for the signatory", each with reasons as codes the page writes in the visitor's language (CHALLENGE.md smart problem 4, spine 3).

## The rule

### Which questions appear (`ask_when`)

A question is asked when **all** its `ask_when` conditions hold; an empty list means always (`data/DATA.md`). Fields: `customer_type`, `category`, `financed_amount_cents`, `term_months`, `answers.<id>`; ops `in`, `gte`, `lte` (both limits included). The order is the bank's. A condition on an unanswered question never holds, so a follow-up appears only after its trigger is answered. `customer_type` reads the applicant's own `q_customer_type` answer once given, the deal's before.

**Card 7**, Haapalan Tila Oy, `farm-002`, 48 months, 2 000 000 down: financed **12 500 000**, a company, a farm machine.

| Question              | Why it appears at 12 500 000                     |
| --------------------- | ------------------------------------------------ |
| `q_customer_type`     | always                                           |
| `q_email`             | always                                           |
| `q_business_id`       | sole trader or company                           |
| `q_company_name`      | company                                          |
| `q_can_sign`          | company                                          |
| `q_vat_registered`    | sole trader or company                           |
| `q_farm_registry`     | category `farm_machine`                          |
| `q_annual_revenue`    | company and financed ≥ 5 000 000                 |
| `q_beneficial_owners` | company and financed ≥ 5 000 000                 |
| `q_pep`               | financed ≥ 1 000 000                             |
| `q_pep_details`       | financed ≥ 1 000 000 **and** `q_pep` = yes, only |

Not asked: the consumer questions (name, birth date, country, employment, income), `q_signatory_email` (can-sign is yes) and `q_usage_purpose` (not an e-bike).

**Card 6**, Norvi Logistics Oy, one `ebike-004` (D8): financed **549 000**. PEP is not asked (< 1 000 000), nor are revenue and owners (< 5 000 000); the usage purpose is (an e-bike), and `q_can_sign` is.

**Card 1**, Aino, `ebike-003`, **389 000**: only the consumer questions, the income question (consumer and ≥ 200 000) and the usage purpose; no PEP.

### Changing an answer (pruning)

After every answer, `pruneAnswers` drops the answers to questions that are no longer visible and repeats until nothing changes (a dropped answer can hide another question). Card 6's trap: the coordinator answers can-sign **no**, names `signatory@norvi.example.com`, goes back and changes to **yes**: the signatory answer goes, and the page says which answer was removed. Changing the customer type from company to consumer drops every company answer in one go. The server prunes again on submit, so a stale answer from the browser never reaches the rules.

### Answers that cannot be taken (D37, D39)

Each answer is checked for its shape (a choice is one of the options, a date a real day, money cents as digits) and then by `answerProblem` against the day and the other answers:

- **Birth date** from 120 years before the request's day up to that day. On **2026-11-05** the range is **1906-11-05 to 2026-11-05**: 2030-01-01 and 1800-01-01 are refused with `birth_date_out_of_range`, and the page says "Enter a date of birth between 5 November 1906 and 5 November 2026". Mikko's 2009-03-10 is an answer; being 17 is a reason (`too_young`), not a refused answer. The date picker gets the same `min` and `max`.
- **Signatory e-mail** must not be the applicant's own: Norvi's coordinator `fleet@norvi.example.com` cannot name `FLEET@norvi.example.com` (case and spaces ignored), `signatory_is_applicant`. "Own" is both the e-mail answered (`q_email`) and the one on the customer record, so answering another `q_email` does not open the door.

The server runs the same checks on submit and answers 400 `INVALID_ANSWER` with `{ questionId, problem }`.

The request body is parsed before anything is read (`createApplicationBodySchema`, a `strictObject`): unknown keys, wrong types and oversize values are 400 `VALIDATION_ERROR`. The bounds, each pinned by a test in `src/app/api/applications/route.test.ts`:

- `quoteId` and `customerId` are trimmed, 1 to 100 characters; the trimmed customer id must be the actor.
- An answer is a string of at most 500 characters or a list of at most 20 items of 200; a question id is `q_` plus lower-case letters, digits and underscores, at most 64 characters (`MAX_QUESTION_ID_LENGTH`); an application has at most 64 answers (`MAX_ANSWERS`, the bank has 19).
- The application id in the path is 1 to 100 characters; `reviewedBy` on a decision is trimmed, 1 to 200.
- Cents are safe integers (Zod 4's `int()`): `1e308` and `2^53` are refused; the quote body has no quantity and refuses one (D8).

### Answers against the customer record (D38, D40)

The applicant is a customer we know, and only that customer applies in their own name: the `customerId` of `POST /api/applications` must be the actor (D17), else 403 `NOT_APPLICANT` (D40); the admin applies for a customer only with `onBehalfOf` naming them, which the audit records (D47). Without it, Mikko could send Aino's id with her answers and be approved in her name. `recordMismatches` compares eight answers with the record: customer type, birth date, e-mail (case ignored), country (a country outside FI, SE, EE on record is answered "other"), monthly net income, business id (spaces ignored), whether the applicant may sign (`applicant_can_sign`: card 6's coordinator answering "yes" would otherwise be approved and sign the contract himself) and annual revenue; amounts compare as cents, so `0320000` is Aino's 320 000. Aino typing 5 000 000 a month for the farm machine of card 7 is held, not approved (review finding 4). A difference is not refused, but the case is never approved by a rule: it goes to `manual_review` with `answer_differs_from_record { question }` for each, after `pep`; the decision page names the question in the visitor's language. A failed rule still rejects first.

**The trap**: Mikko (`cust-mikko`, a consumer born 2009-03-10) answers "Who is leasing?" with **company** and a valid business id. The age question is not asked any more, so the rules alone would approve him; with the record check he goes to `manual_review` with `answer_differs_from_record { question: q_customer_type }`.

### Eligibility (D9)

| Rule (id in `questions.json`) | Check                                                                                          | Reason code                                 |
| ----------------------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------- |
| `min_age`                     | consumers and sole traders are 18 on the start date                                            | `too_young` { birthDate, eighteenOn }       |
| `residency`                   | country FI, SE or EE: the answer, else the record's country (a company)                        | `residency_not_allowed` { country }         |
| `affordability`               | consumers: gross rent × 100 ≤ net income × 30 (when the income was asked)                      | `unaffordable` { gross, max, income cents } |
| `business_id`                 | sole traders and companies: the Y-tunnus check digit                                           | `invalid_business_id` { businessId }        |
| `financed_limits`             | financed within the coefficient table, 30 000 to 25 000 000                                    | `financed_out_of_range` { … }               |
| `pep_manual_review`           | a PEP (answered yes; the question is asked from 10 000 € financed, D82) is never auto-approved | `pep` → `manual_review`                     |
| (D10)                         | a company applicant who cannot sign                                                            | `signatory_needed` → `awaiting_signatory`   |

Order: any failed rule → `rejected`, with **every** failure listed; else PEP → `manual_review`; else cannot sign → `awaiting_signatory`; else `approved` with `all_checks_passed`.

**Card 5**, Mikko (`cust-mikko`), born **2009-03-10**, start **2026-11-05**: he turns 18 on **2027-03-10**, so he is 17 on the start date: `rejected` with `too_young { birthDate: 2009-03-10, eighteenOn: 2027-03-10 }`, and the page says "You can apply from 10 March 2027". His gaming laptop `laptop-008` (289 000, band B) at 25.5 % VAT, half up:

| Term | Net rent | Gross rent | 30 % of 40 000 | Affordable |
| ---- | -------- | ---------- | -------------- | ---------- |
| 24   | 10 269   | 12 888     | 12 000         | no         |
| 36   | 7 972    | 10 005     | 12 000         | yes        |
| 48   | 6 631    | 8 322      | 12 000         | yes        |

At 36 and 48 months the age is the only reason; at 24 both reasons are listed. On 2027-03-10 the age rule passes, on 2027-03-09 it does not. Someone born on 29 February turns 18 on 1 March in a year without one.

**Card 6**: Norvi answers can-sign **no**: `awaiting_signatory` with `signatory_needed { signatoryEmail }`, and in the same transaction a signing link goes to `signatory@norvi.example.com` (D46, [signatories.md](signatories.md)). The signatory signs (approved) or declines (rejected) through that link only (D39); on the decision page everyone, Norvi's own account and the admin included, gets 403 `NOT_SIGNATORY` and nothing is written. The page shows the demo outbox with the link instead of a sign form.

**Card 7**: Haapala's owner is a PEP: `manual_review` with `pep`, never approved by a rule. An admin decides on the decision page; the decision and the reviewer are kept as a `reviewed` reason. A PEP case that also needs a signatory goes to `awaiting_signatory` once the admin approves.

**Two decisions at once.** The decision is a conditional write: `updateMany where { id, decision: <the state read> }`, and exactly one row must change. If two admins (or a double-click) decide the same case at the same instant, the first wins; the second answers 409 `APPLICATION_NOT_PENDING`, and its transaction rolls back with no second audit row and no second `reviewed` reason.

### Plausibility: held for a person, never refused (D48–D52, D58)

After the rules pass, `plausibilityHolds` (`plausibility.ts`) adds reasons that send the case to `manual_review`, after `pep` and the record differences; a failed rule still rejects first. The consumer limits are a team file beside the pack, `data/consumer-limits.json` (`consumerLimitsSchema`): e-bike 2, laptop 2, farm machine 1; farm machines always checked; income ceiling 10 000 000.

| Hold (decision)                         | When                                                                                      | Reason code                                                                                    |
| --------------------------------------- | ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Consumer quantity (D48)                 | a consumer, more units than the category's cap (unreachable since D8: one item per quote) | `quantity_over_consumer_cap { category, quantity, maxQuantity }`                               |
| Category (D49)                          | a consumer, a category flagged `consumer_manual_review` (farm machines)                   | `category_needs_review { category }`                                                           |
| Income (D50)                            | a monthly net income above 10 000 000                                                     | `income_implausible { incomeCents, ceilingCents }`                                             |
| Revenue (D51)                           | a company whose revenue (asked from 5 000 000) is below the financed sum                  | `revenue_below_financed { revenueCents, financedCents }`                                       |
| Owners (D52)                            | "(NN %)" shares summing over 100 %, or a name twice                                       | `owners_implausible { reason: over_100 \| duplicate }`                                         |
| PEP denied (D58, in `recordMismatches`) | a PEP on record answers "no"                                                              | `answer_differs_from_record { question: q_pep }` (no `pep`: the decision uses the answer, D82) |

Worked on the pack: the consumer cap is unit-tested in `src/domain/question-flow/plausibility.test.ts` only, since a quote is one item (D8). Aino with **`farm-003`** gets `category_needs_review`. Aino with an income of **1 000 000 000** gets `income_implausible { 1 000 000 000, 10 000 000 }`; with an income of 1 cent she is still `rejected` (`unaffordable`). Kettukoodi with **`farm-002` and 9 500 000 down** (5 000 000 financed) and revenue **1** gets `revenue_below_financed { 1, 5 000 000 }`; revenue 5 000 000 passes. Owners `A (60 %)`, `B (41 %)` → `over_100`; `Jussi Haapala (60 %)`, `jussi haapala (40 %)` → `duplicate`; Haapala's own 60 % + 40 % and free text without shares pass. Card 6 (a company, one bike) and card 7 (a company, a farm machine) are unchanged.

### One application per quote, and who reads it (D55–D57)

A quote has no owner (D55): any customer applies on it in their own name. But while one application on a quote is `manual_review`, `awaiting_signatory` or `approved`, `createApplication` refuses the next with `quote_in_use` and its `applicationId` (409 `QUOTE_IN_USE`), checked inside the transaction, so a double submit writes one row; a rejected application, or a manual review the admin rejected, frees the quote (D56). `GET /api/applications/[id]` answers only the applicant and `admin`; anyone else gets the same 404 `APPLICATION_NOT_FOUND` as for an id that does not exist (D57).

Allowed on purpose: a signatory e-mail that belongs to another customer (D54). A `q_email` other than the record's was to be allowed (D53), but the D38 amendment of #49 compares it with the record, so it holds the case for a person.

### The age again at signing (D59)

`planContract` takes the customer's birth date from the record (`signContract` reads it through `getCustomer`) and refuses with `too_young_at_start { adultFrom }` when the start day is before the 18th birthday: born 2008-12-01, a start on 2026-11-30 is refused (`adultFrom` 2026-12-01), a start on 2026-12-01 signs, even on a quote made on 2026-11-05. A company has no birth date and no check. The contract page writes it from `contract.refusal.too_young_at_start`.

### The Y-tunnus check digit

Seven digits, a hyphen, a check digit. Multiply the digits by **7 9 10 5 8 4 2**, sum, take the remainder mod 11: remainder 0 → check digit 0; remainder 1 → no valid id; otherwise 11 − remainder.

Typo Trading Oy (`cust-broken-id`) has **1234567-8**: 1·7 + 2·9 + 3·10 + 4·5 + 5·8 + 6·4 + 7·2 = 153; 153 mod 11 = 10; check digit 11 − 10 = **1**, not 8. Rejected with `invalid_business_id { businessId: 1234567-8 }`. Every other business id in `customers.json` is valid. A wrong check digit is a valid _answer_ (the form takes it) and a _reason_ (the rules reject it), so the applicant sees why. The hint under the field is `apply.hint.<format>` in the visitor's language, the pack's English only as the fallback (review finding 6).

### On the page

"Why we ask" is a teal note (the `info` role, D21) with an info glyph and a chevron under each question, a native `<details>` so it opens from the keyboard; it spans the column on a phone and fits its text from `sm` up, so it does not read as one more option. The decision page leads with the outcome as an `h2` under the page's `h1`; a yes shows no reasons ("every check passed" adds nothing), while a no, a manual review and a wait for the signatory list theirs under "Why". A no is worded politely ("Sorry, your lease application was not approved"; card 5 adds "You can apply from 10 March 2027."), and every outcome ends with a way back to the home page and the catalogue.

**The name against the record (D89).** A consumer's or sole trader's `q_full_name` is compared with the record like the birth date and the e-mail: a different name is a `record_mismatch`, so a person checks the case. `nameWords` ignores case, extra spaces, accents and word order: Aino answering "Maija Meikäläinen" goes to review; Sanna answering "sanna makela" or "Mäkelä Sanna" does not. A company's record name is not compared.

**Stepping back (D87).** An application not signed yet (approved, manual review, awaiting the signatory) can be withdrawn by its applicant or the admin: it becomes `withdrawn` with a `withdrawn` reason (`withdrawalCheck`, `withdrawApplication`, `POST /api/applications/[id]/withdraw`). The decision page shows "Changed your mind?" with "Cancel application"; a withdrawn one shows "Application cancelled" and is left off the leases lists.

**Why we ask.** The page's texts are the message files' `question.why.*`, not the pack's English: "Who is leasing?" now says what changes (a person's age and income, a business's ID and who can sign), and the e-bike use says what it means (delivery adds far more kilometres; they and the condition are checked on return). The answer to the e-bike use is stored with the application; no rule reads it.

## Decisions

- **D9** eligibility: the rules above, every check a code with params.
- **D10** manual review and the signatory: the four statuses; the admin decides a manual review, the named signatory signs (through the link, D39 and D46).
- **D37** birth dates from 120 years ago up to today; under 18 stays a reason.
- **D38** an answer that differs from the customer record holds the case for a person.
- **D39** (narrows D10) only the signing link signs an `awaiting_signatory` case; the applicant cannot name themself, answered or on record.
- **D40** (narrows D17) only the acting customer applies, in their own name.
- **D46** the company's signatory list and the signing link ([signatories.md](signatories.md)).
- **D47** the admin applies on a customer's behalf with `onBehalfOf`, recorded in the audit.
- **D48–D52** the plausibility holds: consumer quantity cap, farm machines for consumers, the income ceiling, revenue below the financed sum, owners over 100 % or named twice.
- **D53** a different `q_email`: superseded by the D38 amendment of #49 (it is compared with the record and holds the case). **D54** a signatory on another customer's record is allowed.
- **D55, D56** quotes are anonymous; one pending or approved application per quote (`QUOTE_IN_USE`).
- **D57** only the applicant and the admin read an application through the API; others get 404.
- **D58** a PEP on record answering "no" is a record difference too.
- **D82** only what the customer answered decides: the PEP question is hidden below 10 000 € financed, so no PEP check runs there, even for a PEP on record (Haapala's e-bike and laptop are approved; card 7's farm machine is asked and goes to review). Prefill (`answersFromCustomer`) may fill any answer, `q_pep` included, but the server's `pruneAnswers` drops every answer to a hidden question before the decision, so only visible ones, which the customer sees and can change, reach it; a company's residency uses its registered country, which the organisers allow.
- **D59** the age is checked again on the contract's start day at signing.
- Inside the slice (see `docs/log/wave1-questions.md`): `customer_type` follows the applicant's answer; a PEP known from the record no longer counts below 10 000 EUR (D82, the organisers' rule: a hidden question's rule does not run); affordability only where the bank asks for income; a failed rule always rejects.

## Pure functions

```ts
// engine.ts
type FlowContext = { customerType: string; category: string; financedCents: number; termMonths: number };
type Answer = string | readonly string[]; // money: integer cents as digits
type Answers = Readonly<Record<string, Answer>>;
visibleQuestions(bank: readonly Question[], context: FlowContext, answers: Answers): Question[];
nextQuestion(bank, context, answers): Question | null;
isComplete(bank, context, answers): boolean;
pruneAnswers(bank, context, answers): Record<string, Answer>;
whyWeAsk(question: Question, locale: 'en' | 'fi' | 'sv' | 'et'): string;

// eligibility.ts
evaluate(rules: readonly EligibilityRule[], input: EligibilityInput): // input.recordMismatches?: question ids (D38)
  { decision: 'approved' | 'rejected' | 'manual_review' | 'awaiting_signatory'; reasons: { code; params }[] };
birthdayAtAge(birthDate: string, years: number): string;
maxAffordableRentCents(monthlyNetIncomeCents: number): number;

// business-id.ts
isValidBusinessId(value: string): boolean;
businessIdCheckDigit(sevenDigits: string): number | null;

// answers.ts
eligibilityInputFromAnswers({ context, answers, startDate, grossMonthlyRentCents, financedLimits?, recordMismatches? }): EligibilityInput;
validateAnswer(question: Question, answer: Answer): boolean; // the shape only
answerProblem(question, answer, { today, answers?, applicantEmail? }): // null, or
  { code: 'invalid' } | { code: 'birth_date_out_of_range'; params: { earliest; latest } } | { code: 'signatory_is_applicant' };
birthDateRange(today: string): { earliest: string; latest: string };
parseEurosToCents(input: string): number | null;
grossFromNetCents(netCents: number, vatRateBp: number): number;
answersFromCustomer(customer: Customer): Record<string, Answer>;

// record-check.ts
recordMismatches(record: Customer, answers: Answers): string[]; // question ids, the bank's order (type, birth date, e-mail, country, income, business id, can sign, revenue, PEP denied)

// plausibility.ts (D48–D52)
plausibilityHolds(limits: ConsumerLimits | undefined, input: PlausibilityInput): Reason[];
// input: customerType, category?, quantity?, monthlyNetIncomeCents?, annualRevenueCents? (null: asked, no number), beneficialOwners?, financedCents
ownerShares(lines: readonly string[]): { name: string; hundredths: number | null }[];
ownersProblem(lines: readonly string[]): 'over_100' | 'duplicate' | null;

// src/domain/contracts/sign.ts (D59)
planContract({ …, birthDate? }); // adds { code: 'too_young_at_start'; params: { adultFrom } } to the refusals

// signatory.ts
sameEmail(a?: string, b?: string): boolean;
sameEmail(a?: string, b?: string): boolean; // case and spaces ignored, blank is never the same
whoDecides(decision): 'admin' | 'signing_link' | 'final'; // manual_review, awaiting_signatory, the rest

// src/server/applications.ts
createApplication(db, { quoteId, customerId, answers, today, actor, onBehalfOf? }); // not_applicant unless actor = customerId, or admin with onBehalfOf = customerId (D40, D47); makes the signing link on awaiting_signatory // → { ok, application } | { ok: false, reason }
decideApplication(db, { id, decision, reviewedBy, today, actor }); // the admin's review; awaiting_signatory → not_signatory for everyone (D39)
recordSignatoryDecision(tx, { id, decision, by, today }); // inside decideByToken (signatories.md)
getApplication(db, id): Promise<ApplicationView | null>;
// createApplication also refuses { reason: 'quote_in_use', applicationId } (D56)
```

## Files

- `src/domain/question-flow/engine.ts`, `eligibility.ts`, `business-id.ts`, `answers.ts`, `record-check.ts`, `signatory.ts`, `plausibility.ts` and their tests
- `data/consumer-limits.json` (team file), `consumerLimitsSchema` in `src/data/schemas.ts`, `loadConsumerLimits` in `src/data/load.ts`
- `src/server/applications.ts` (+ test); routes `src/app/api/applications/route.ts`, `[id]/route.ts`, `[id]/decision/route.ts`; rows in `src/server/routes.ts`
- `src/app/[locale]/apply/[quoteId]/page.tsx`, `src/components/question-flow.tsx`; `src/app/[locale]/applications/[id]/page.tsx`, `decision-form.tsx`
- Message keys `apply.*`, `question.*`, `decision.*` in the four files

- `src/domain/question-flow/withdraw.ts` and `src/server/withdraw.test.ts` (D87); `nameWords` in `record-check.ts` (D89).

## Tests that pin the numbers

| Number                                                                                                                                                    | Test                                                                                                                                           |
| --------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Card 7's ten questions, PEP details after yes                                                                                                             | `engine.test.ts` "card 7: …"                                                                                                                   |
| Card 6 at 549 000 (no PEP), signatory pruning                                                                                                             | `engine.test.ts` "card 6: …", "pruneAnswers … card 6"                                                                                          |
| Card 1's consumer questions                                                                                                                               | `engine.test.ts` "card 1: …"                                                                                                                   |
| Mikko 2027-03-10; rents 12 888 / 10 005 / 8 322                                                                                                           | `eligibility.test.ts` "evaluate: card 5"                                                                                                       |
| Norvi `awaiting_signatory`, Haapala `manual_review`                                                                                                       | `eligibility.test.ts` "card 6", "card 7"; `applications.test.ts` on a real DB                                                                  |
| 1234567-8 → check digit 1; every other id valid                                                                                                           | `business-id.test.ts`                                                                                                                          |
| 10 730 net → 13 466 gross                                                                                                                                 | `answers.test.ts` "grossFromNetCents"                                                                                                          |
| Every persona decides without throwing                                                                                                                    | `eligibility.test.ts` "every customer in customers.json …"                                                                                     |
| Admin review, signatory sign-off, final states                                                                                                            | `applications.test.ts` "decideApplication (D10)"                                                                                               |
| Birth date range 1906-11-05 to 2026-11-05; 2030 and 1800 refused                                                                                          | `answers.test.ts` "birthDateRange", "answerProblem"; `applications.test.ts` "a birth date in the future …"                                     |
| Mikko answering "company" → `manual_review`, not approved                                                                                                 | `record-check.test.ts`, `eligibility.test.ts` "answers that differ …"; `applications.test.ts` "card 5 Mikko answering …"                       |
| Mikko cannot apply in Aino's name; nor the admin or anonymous                                                                                             | `applications.test.ts` "card 5 Mikko cannot apply in Aino's name …"                                                                            |
| Only the signing link signs; the company account and the admin get NOT_SIGNATORY; not oneself                                                             | `signatory.test.ts`; `applications.test.ts` "card 6 cannot be signed by …", "cannot name themself …"                                           |
| Two decisions at the same instant: one wins, the other writes nothing                                                                                     | `applications.test.ts` "two decisions at the same instant …"                                                                                   |
| Cards 5, 6, 7 and every customer × category on the data pack (scenario harness)                                                                           | `src/domain/scenarios/card-05-too-young.test.ts`, `card-06-who-can-sign.test.ts`, `card-07-big-ticket.test.ts`, `customers.test.ts`            |
| Birth dates at the edges: today, tomorrow, 1906-11-05 and the day before, 29 Feb → 1 Mar, the start day vs the quote day, one day off the record          | `src/domain/scenarios/answers-hardening.test.ts` "birth dates"                                                                                 |
| Type and record: consumer ↔ company, a corrected broken id, wrong check digits and prefixes, countries, PEP both ways, the coordinator answering "yes"    | `answers-hardening.test.ts` "the customer type and the record"; `record-check.test.ts` "card 6 Norvi's coordinator …"                          |
| The signatory cannot be the record e-mail either; a failed rule wins over PEP and the record; the same outcome from every answer order                    | `answers-hardening.test.ts` "conflicting and extra answers", "precedence"; `answers.test.ts` "nor the applicant's record e-mail"               |
| Quantities, down payments and terms that cannot be; 1 vs 2 `ebike-004` for PEP, 14 vs 15 `laptop-004` for revenue; income 44 887 passes, 44 886 does not  | `src/domain/scenarios/plausibility.test.ts`                                                                                                    |
| D48–D52 on the pack: 20 bikes held, 2 approved, a company uncapped; `farm-003`; income 1 000 000 000 held, 10 000 000 not; revenue 1 vs 5 235 000; owners | `src/domain/scenarios/plausibility.test.ts`; the edges in `src/domain/question-flow/plausibility.test.ts`; the file in `src/data/load.test.ts` |
| D53, D54, D58: another `q_email` held (D38), a signatory on Aino's record, Haapala answering PEP "no"                                                     | `answers-hardening.test.ts`; `record-check.test.ts`                                                                                            |
| D55, D56: any customer on any quote; approved, manual review and awaiting signatory hold the quote, a rejection frees it; 409 `QUOTE_IN_USE`              | `src/server/applications.hardening.test.ts` "one pending or approved application per quote"; `route.test.ts`                                   |
| D57: the admin reads; another customer, anonymous and no actor get the unknown id's 404                                                                   | `src/app/api/applications/route.test.ts` "GET /api/applications/[id]"                                                                          |
| D59: born 2008-12-01, a start on 2026-11-30 refused, on 2026-12-01 signed; 29 February; a company                                                         | `src/domain/contracts/sign.test.ts` "re-checks the age"                                                                                        |
| Random customer × asset × term × down payment: a known refusal or a decision whose codes have keys in all four languages (seed 20261105)                  | `src/domain/scenarios/question-flow.property.test.ts`                                                                                          |
| Declining then signing, signing twice, anonymous, the quote's last valid day, the reason chain pep → differs → signatory → reviewed → signed              | `src/server/applications.hardening.test.ts`                                                                                                    |
| The routes: unknown keys, wrong types, a 100 000-character answer, 65 answers, every wrong actor; always `fail()` with a code                             | `src/app/api/applications/route.test.ts`                                                                                                       |

## Open questions

- The signatory signs through the signing link (D46); no e-mail is sent in the demo, the decision page shows the link in a demo outbox. See [signatories.md](signatories.md) for what production replaces.
- Affordability uses the chosen term's gross rent; the page could suggest the shortest term that passes (Mikko's 36 months).
- The form should still disable its button while sending: a double submit now gets 409 `QUOTE_IN_USE` for the second request (D56).
- `grossFromNetCents` is a local copy until the money/VAT helper on main replaces it.
- The consumer limits are a team file of their own beside `data/term-limits.json` (D43, merged after this work began); the two could become one file.
