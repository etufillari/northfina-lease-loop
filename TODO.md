# TODO

## Before the pitch (16:30)

- [x] **Catalogue status filter label.** Settled: the catalogue never shows sold items and
      "Sold" is no longer a status you can pick, so "Any status" is accurate again. Sold items
      are counted on the admin page instead (Sold items: how many, what was paid, which ones).

## From the hosts' answers (Celal, Discord, 6 Nov)

Checked against the code on 6 Nov. Nothing below is done yet. Each item says what the hosts
expect, what we do now, and what to do or explain.

### Must fix or decide

- [ ] **Card 6: a saved "waiting for signature" state for a single item.** Hosts: after "no" to
      "can you sign?", ask for the signatory's email (we do); the contract is saved as _waiting
      for signature_, tied to that email, and survives a reload. The applicant can't sign or
      activate it, and no invoices exist until it is signed. Bonus: finish the handoff with a
      fake signing link or an on-screen "outbox" (no real emails). **We now:** a single-item
      application ends in generic manual review ("A person needs to check this application").
      Only the fleet page names the signatory's email. There is no waiting-for-signature
      record and no handoff. **To do:**
  - Show "waiting for the signature of <email>" on the application page.
  - Add an outbox or signing link that lets the signatory sign (e.g. act as the signatory).
  - Decide and explain **which price is locked if the signatory signs on a later day**.
    Suggestion: the quote's price, as long as it is signed within its 14 days (card 2); after
    that the quote expires and they apply again.
- [ ] **Battery replacement must not wipe the odometer.** Hosts: keep two numbers.
  - _Total usage_ never resets. It is used for the passport and the CO₂ figures.
  - _Usage since the last battery_ is set to 0 by a battery replacement. It drives the usage
    adjustment in the market value and the next replacement trigger (≥ 15,000 km / ≥ 500
    cycles).
  - A new battery doesn't change the age curve or the condition.

  **We now:** a step with `resets_usage` sets `usage_value` itself to 0
  (`src/domain/second-life.ts` `usageAfter`, saved in `src/server/second-life.ts`). That loses
  the item's total km for its passport and for the CO₂ riding figure. **To do:** add a "usage
  since battery" column, keep `usage_value` as the total, and value on the reset counter. The
  other reading ("it only resets the maintenance counter") is allowed if we document it, but
  ours does neither.

- [ ] **Age of used items: 1 July vs 1 January.** Hosts: price at first lease = the price in
      price list v1 (we do this, `originalListPrice`), and age = months since **1 January** of
      `model_year`. A different assumption is fine if written down. **We now:** age is
      counted from **1 July** (mid-year, `ageInMonths` in `src/domain/second-life.ts`). It is
      documented in the code but not in the README. The hosts' worked example (ebike-007:
      46 months → 32.5 % → €927.81; new battery €1,159.76; fair → good €1,516.61) won't match
      our numbers. **To decide:**
  - Switch to 1 January, so the judges' numbers match ours (changes cards 8–10 figures,
    README and tests).
  - Or keep 1 July and put the reasoning in the README and the pitch.

### Check and explain in the pitch

- [ ] **Hidden questions vs customers.json.** Hosts: what the customer answers is the truth. A
      visible question may be prefilled from the persona (and can be changed). A hidden
      question has no answer, so its rule doesn't run, and the persona's value must not be
      read quietly. **We now:** the persona only prefills the form (`src/domain/prefill.ts`).
      Answers to hidden questions are pruned before deciding and sending. **To do:**
  - Confirm with a test that the server never reads persona data for a hidden question (e.g.
    income under €2,000 financed, PEP under €10,000).
  - Decide and document whether residency applies to companies (country isn't asked of
    them).
  - Make sure each decision can be explained from the answers ("we didn't ask about income
    because the amount is under €2,000").
- [ ] **Spine step 7, the operator's price and its reason.** Hosts: an operator-entered net
      price is enough if it is saved on the item with who, when and **why** (audit log), feeds
      the normal pricing (coefficients, terms, sliders) and makes the item leasable again with
      a new life in its history. Their suggestion is to show the curve value as a suggestion
      the operator can accept or override, **with the reason saved**. **We now:** the
      workbench suggests the curve value and the operator can change the price. It is saved
      through `withAudit` with the actor, and `notes` is optional. **To do:** when the price
      differs from the suggestion, require a reason and show it in the passport and the audit
      row.
- [ ] **"Pass it on".** Hosts: the item goes straight to the next person, either someone from
      the waiting list or someone the customer names. Decide whether there is a check first,
      what happens to the first contract, how the new price is set, and whether the passport
      shows both lives. **We now:** the lessee names another customer, the item goes back for
      a check, and the recipient accepts (reserved for them) or declines (normal second-life
      pool). **To do:**
  - Be ready to explain those four choices.
  - Possibly also allow passing it to the waiting list's best match directly from the
    end-of-term page.

### Already in line with the answers

- **Card 6 is 1 × ebike-004** (README and CHALLENGE.md updated). Fleets are our extra.
- **Re-leasing stores the real date and price** (refurbishment record and the new contract),
  so the next life has a proper passport.
- **Market value = v1 price × age curve × condition × usage**, linear between the curve's
  points and held after the last one, with the usage cap.
