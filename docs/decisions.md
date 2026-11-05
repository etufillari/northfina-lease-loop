# Decision log

Every product, domain and engineering decision, in the order it was made. It is the source for the pitch, so a decision is logged in the same PR as the change.

**Adding an entry:** take the next `D-NNN`, add a row to the index and write the entry below. Never rewrite an old entry: mark it `Superseded by D-NNN` and add a new one. Each entry covers context, decision, alternatives, why, consequences and evidence (bugs caught, test results) where they apply.

## Index

| ID    | Date       | Area     | Decision                                                           |
| ----- | ---------- | -------- | ------------------------------------------------------------------ |
| D-001 | 2026-11-05 | Strategy | Build in the fork; the starter's tooling and conventions win       |
| D-002 | 2026-11-05 | Pricing  | Rent comes from the coefficient table, not our own annuity model   |
| D-003 | 2026-11-05 | Product  | Smart Problems: 1 (VAT), 5 (money adds up), 6 (explain my price)   |
| D-004 | 2026-11-05 | Product  | No agent or MCP integration                                        |
| D-005 | 2026-11-05 | Domain   | One rounding rule: `roundHalfUp`, half away from zero, noise-proof |
| D-006 | 2026-11-05 | Testing  | Expected values come from hand calculations, never from the code   |
| D-007 | 2026-11-05 | Testing  | `src/domain` held to 90 % coverage, above the 60 % project gate    |
| D-008 | 2026-11-05 | Workflow | Protected `main`: every change is a squash-merged PR with green CI |
| D-009 | 2026-11-05 | CI       | CI pinned to `ubuntu-24.04` for the hackathon                      |
| D-010 | 2026-11-05 | Workflow | Rebase-merge PRs so every small commit stays in the history        |

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
