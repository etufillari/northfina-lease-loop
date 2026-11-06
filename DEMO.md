# Demo guide

How to put Lease Loop into a state that shows every flow, and how to check each scenario by hand.

## Set up

```bash
npm run db:demo
npm run dev
```

Then open <http://localhost:3000/en>.

**`db:demo` wipes your local database first.** It never changes the files in `data/`, and a plain `npm run db:setup` adds none of this. Run it again at any time to start over.

## How to move around

- **Log in:** pick a person in the dropdown at the top of the page. There is no password.
- **Change the date:** log in as **Northfina admin** and use the date control in the header. The page reloads on the new date. After `db:demo` the app runs on **5 November 2026**.
- **Open an item:** go to `/en/assets/<id>`, for example `/en/assets/ebike-003`. Some items share a name, so the id is the safest way.
- **Change language:** use the language switcher in the header.

**Careful with the date:** moving more than 7 days past a contract's end closes it as returned, and moving the date back does not reopen it.

## Ready after `db:demo`

| State                           | Log in as                                                  | Item                                    | Where to look                     |
| ------------------------------- | ---------------------------------------------------------- | --------------------------------------- | --------------------------------- |
| Rejected, too young             | Mikko Laine                                                | `laptop-005`                            | My applications                   |
| Rejected, cannot afford it      | Sanna Mäkelä                                               | `farm-008`                              | My applications                   |
| Rejected, wrong business ID     | Typo Trading Oy                                            | `laptop-005`                            | My applications                   |
| Waiting for manual review       | Northfina admin, or Haapala                                | `farm-003`                              | Manual review, or My applications |
| Approved, ready to sign         | Lena Tamm                                                  | `ebike-006`                             | My applications                   |
| Waiting for a company signature | Anna Norvi                                                 | `laptop-010`                            | My applications                   |
| Signed, crosses the VAT change  | Pekka Korhonen                                             | `ebike-005`                             | Contracts, Invoices               |
| Held for someone                | Jonas Lind, or Dealer desk                                 | `ebike-002`                             | Catalogue, or Dealer dashboard    |
| Re-listed used item             | Anyone                                                     | `ebike-011`                             | Catalogue                         |
| Returned, waiting for a dealer  | Dealer desk                                                | 5 items                                 | Dealer dashboard                  |
| Reserved, cannot be leased      | Anyone                                                     | `ebike-009`                             | Catalogue                         |
| End-of-term choice              | Olavi Niemi, Ella Salmi, Kettu Koodi Oy, on 1 January 2027 | `laptop-002`, `ebike-012`, `laptop-009` | See [End of term](#end-of-term)   |

## The application steps

Cards 1 to 7 start the same way:

1. Set the date, then log in as the customer.
2. Open the item and set the sliders.
3. Click **Apply for leasing** and answer the questions. A question only appears when it applies, so skip any listed answer you are not asked for.
4. Click **Continue to review**, then **Submit application**.
5. To reach the contract, click **View my applications**, then **Continue to contract**.

## Scenario cards

The cards don't depend on each other, and the demo leaves everything they need untouched. Set the date each card asks for first.

### Card 1: Happy path

**Date:** 5 Nov 2026. **Log in as:** Aino Virtanen. **Item:** `ebike-003`, 36 months, no down payment.

| Question        | Answer                      |
| --------------- | --------------------------- |
| Who is leasing? | Consumer                    |
| Full name       | Aino Virtanen               |
| Date of birth   | 12 April 1997               |
| Email           | `aino.virtanen@example.com` |
| Country         | Finland                     |
| Employment      | Employed                    |
| Monthly income  | 3200                        |
| E-bike use      | Commuting                   |

**Expect:** approved. The contract page shows:

- Monthly net rent of **€107.30**.
- A warning that the monthly payment becomes **€135.20** from 1 January 2027.
- Total cost including VAT of **€4,866.12**.
- First invoices of **€134.66**, **€134.66** and **€135.20**, with a note on the third explaining the change.

Tick the confirmation and click **Sign contract** to finish.

### Card 2: The price lock

**Date:** 5 Nov 2026. **Log in as:** Lena Tamm. **Item:** `laptop-004`, 36 months, no down payment.

Answers: Consumer, Lena Tamm, 30 August 1991, `lena.tamm@example.com`, Estonia, Employed, income 2100.

1. Submit the application. It is approved.
2. Log in as Northfina admin and set the date to **6 Nov 2026**.
3. Log in as Lena and open the contract.

**Expect:** base price **€3,490.00** from price list 1, and list price on signing **€3,211.00**. The rent stays at **€96.27**, and a line under the prices says the customer keeps the price from their quote.

### Card 3: Tax is not price

**Date:** 15 Sep 2026. **Log in as:** Aino Virtanen. **Item:** `ebike-001`, 24 months, no down payment.

Use Aino's answers from card 1, then open the contract. You don't need to sign.

| Invoice     | Net    | VAT    | Total  |
| ----------- | ------ | ------ | ------ |
| 15 Dec 2026 | €69.57 | €17.74 | €87.31 |
| 15 Jan 2027 | €69.57 | €18.09 | €87.66 |

**Expect:** the net rent stays the same, and a note under the January invoice says the total rose by €0.35 because VAT went from 25.5 % to 26 %.

To see the same note on a signed contract, log in as Pekka Korhonen, click **My applications**, then **Invoices** in the sidebar.

### Card 4: Calendar traps

**Date:** 31 Jan 2026. **Log in as:** Sanna Mäkelä. **Item:** `laptop-001`, 36 months, no down payment.

Answers: Consumer, Sanna Mäkelä, 2 November 2004, `sanna.makela@example.com`, Finland, Student.

**Expect:** in the payment schedule, the February invoices are due on **28 Feb 2026** and **29 Feb 2028**, and the months after go back to the 31st.

### Card 5: Too young

**Date:** 5 Nov 2026. **Log in as:** Mikko Laine. **Item:** `laptop-008`, 36 months, no down payment.

Answers: Consumer, Mikko Laine, 10 March 2009, `mikko.laine@example.com`, Finland, Student, income 400 if asked.

**Expect:** the form warns about eligibility but still lets him continue. After submitting, he sees "Application not approved", the reason in plain words, and **Eligible from: 10 March 2027**. The same reason stays in My applications.

### Card 6: Who can sign?

**Date:** 5 Nov 2026. **Log in as:** Norvi Logistics Oy. **Item:** `ebike-004`, 36 months, no down payment.

| Question                | Answer                    |
| ----------------------- | ------------------------- |
| Who is leasing?         | Company                   |
| Email                   | `fleet@norvi.example.com` |
| Business ID             | `3299871-7`               |
| Company name            | Norvi Logistics Oy        |
| Can you sign contracts? | No                        |
| Email of who can sign   | `ceo@norvi.example.com`   |
| VAT registered          | Yes                       |
| E-bike use              | Delivery work             |
| Politically exposed     | No                        |

1. Submit and open the contract. **Expect:** it says the designated signatory must sign, and there is no sign button.
2. Log in as **Anna Norvi** and click **My applications** in the header.
3. Click **Continue to contract** on `ebike-004`, then sign.

The app leases one item per contract, so this card covers one bike, not 4.

### Card 7: Big ticket

**Date:** 5 Nov 2026. **Log in as:** Haapalan Tila Oy. **Item:** `farm-002`, 48 months, down payment **€20,000**.

| Question                | Answer                                     |
| ----------------------- | ------------------------------------------ |
| Who is leasing?         | Company                                    |
| Email                   | `office@haapala.example.com`               |
| Business ID             | `2876543-5`                                |
| Company name            | Haapalan Tila Oy                           |
| Can you sign contracts? | Yes                                        |
| VAT registered          | Yes                                        |
| Farm registry number    | `FR-12345`                                 |
| Annual revenue          | 950000                                     |
| Owners over 25 %        | Jussi Haapala (60 %), Maria Haapala (40 %) |
| Politically exposed     | No                                         |

**Expect:** 10 questions, and "Application under review". Our records list a politically exposed owner, so it goes to a person even though the answer says no.

1. Log in as Northfina admin and click **Manual review**.
2. The case shows the deal, the answers and the warning from our records. It sits next to the demo case on `farm-003`.
3. Click **Approve** or **Reject**. The case leaves the queue.
4. Log in as Haapala. After approval, **Continue to contract** works. After rejection, My applications says a person reviewed it.

### Card 8: Early exit

Not built. Ending a contract before its term is refused with `CONTRACT_NOT_DUE`.

### Card 9: Second life

**Date:** 5 Nov 2026. **Log in as:** Dealer desk. Open **Dealer dashboard** and find `ebike-007`.

1. Leave the condition on Fair and click **Check price**. **Expect:** refused, because it must reach at least good. Value as it is: **€1,013.45**.
2. Change the condition to Good and check again. **Expect:** the calculation, ending in **€1,325.29**.
3. Click **Re-list at €1,325.29**. The item leaves the dashboard and appears as available in the catalogue.

Choosing who on the waiting list gets it is not built.

### Card 10: Third life

**Date:** 5 Nov 2026.

1. Log in as Dealer desk. On `ebike-008`, keep Good and 9800 km, then click **Check price** and **Re-list at €344.82**.
2. Log in as Olavi Niemi and apply for `ebike-008`, 24 months, no down payment.

Answers: Consumer, Olavi Niemi, 18 June 1956, `olavi.niemi@example.com`, Finland, Retired, Commuting.

**Expect:** approved, on the re-listed price. The passport and CO₂ are not built.

## Other flows

### Manual review

Log in as Northfina admin and click **Manual review**. The demo case is Haapala's `farm-003`. To see the access rule, log in as Dealer desk and go to `/en/admin/applications`: it says admins only.

### Sign a contract

Log in as Lena Tamm, click **My applications**, then **Continue to contract** on `ebike-006`. The page shows the total cost of **€1,686.22** and the VAT warning. Tick the confirmation and click **Sign contract**.

### Held items

1. Log in as Jonas Lind and open the catalogue. **Expect:** `ebike-002` is first among the e-bikes, marked **Reserved for you**.
2. Log in as anyone else. **Expect:** it shows as Reserved and can't be leased.
3. Log in as Dealer desk. **Expect:** Held items says "Held for Jonas Lind". Click **Release**, and it is available to everyone.

### Notifications

Short pop-ups that disappear after 6 seconds. You need **two logged-in people at once**, and tabs in one browser share a login, so use a second browser or a private window. Only people with the app open get them: nothing is saved for later.

| In one window              | Do this                          | The other window sees               |
| -------------------------- | -------------------------------- | ----------------------------------- |
| Northfina admin            | Approve or reject Haapala's case | Haapala: application result         |
| Haapalan Tila Oy           | Apply for another farm item      | Northfina admin: new review case    |
| Dealer desk                | Release `ebike-002`              | Jonas Lind: the hold has ended      |
| Kettu Koodi, on 1 Jan 2027 | Pass `laptop-009` on to Noora    | Noora Heikkinen: passed on to you   |
| Dealer desk                | Re-list that `laptop-009`        | Noora Heikkinen: ready for you      |
| Anna Norvi                 | Sign the `laptop-010` contract   | Norvi Logistics Oy: contract signed |

Dealers and signatories get no notifications, and admins only get new review cases.

### Audit log

Log in as Dealer desk or Northfina admin and click **Audit log**. Every change shows who made it, what it was and when, newest first. Customers see "Staff only". The times are real clock times, so they don't follow the demo date.

### End of term

Three contracts reach their end on 1 January 2027, so you can try each choice without resetting. Any of them can make any choice.

1. Log in as Northfina admin and set the date to **1 January 2027**. VAT is now 26 %.
2. Log in as the customer, click **My applications** in the header, then **Contracts** in the sidebar. The contract is under **End-of-term decisions**, with **Buy out**, **Return** and **Pass on** buttons.

| Log in as      | Item         | Try     | Expect                                                                            |
| -------------- | ------------ | ------- | --------------------------------------------------------------------------------- |
| Olavi Niemi    | `laptop-002` | Buy out | The item is sold, and Invoices gains a €1,008.00 buyout                           |
| Ella Salmi     | `ebike-012`  | Return  | The item appears in the Dealer dashboard under Returned items                     |
| Kettu Koodi Oy | `laptop-009` | Pass on | Choose Noora Heikkinen. The item appears under both Returned items and Held items |

To finish a pass-on, log in as Dealer desk and re-list `laptop-009`. Noora then sees it as **Reserved for you**, and everyone else is refused.

Set the date past **8 January 2027** instead, and any contract nobody decided on closes as returned by itself. Moving the date back does not reopen it, so run `npm run db:demo` to start over.

## Not built yet

- Early exit (card 8).
- Waiting-list matching and refurbishment costs (card 9).
- The item passport and CO₂ savings (card 10).
- Leasing several items in one contract (card 6).
