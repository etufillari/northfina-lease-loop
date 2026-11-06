# Lease Loop — current progress

Updated 6 November 2026. Local branch: `feat/lease-lifecycle-team-handoff`, based on team main `f50304f`. Your teammate’s company profile, return-request form and approval workflow are integrated with the local demo, access and smart-point improvements. Combined work is prepared on the team handoff branch.

## Working loop

**Catalogue → quote → application → signed contract → active lease → invoices → end choice → physical return → inspection → required refurbishment → company approval → used offer → second customer's lease/invoice on the same asset.**

The original signed terms and invoices survive second-life repricing. Payments are not fabricated.

## Latest changes

Company operations retains the teammate’s sidebar/admin profile and Returned queue. A live notification bar counts submitted customer requests awaiting physical receipt, polls every 15 seconds, refreshes on browser focus and links to the request queue. Receiving the item clears that notification. Imported examples and replayed requests do not create duplicate alerts.

The customer chooses Return, enters usage and submits the request. Notifications follow the saved REQUESTED record, not a button click or a fabricated delivery.

Customer lease details open automatically. Completion choices and plain-language explanations appear above invoices. The restored demo button requires confirmation. Saved return/buyout choices show the relevant handover or payment next steps; return guidance follows receipt and approval status. Buttons have keyboard focus styles, descriptive labels and busy/error feedback. Visual keyboard/mobile QA is still pending.

- Customer My leases contains owned contracts, invoices, end choices and handover instructions. Invoice generation and company completion controls moved to the company workshop. An explicit customer-owned development simulation button is also available in My leases.
- The workshop requires separate development operator sign-in. Customer cookies alone cannot authorize workshop, invoice-generation or company completion APIs. The separate `/demo-complete` route permits only a development customer’s own lease simulation. Signed HTTP-only operator sessions expire after four hours.
- Workshop completion saves a pending proposal, keeps the asset unavailable and retains its allocation. Approval publishes one offer and releases the allocation atomically. Rejection requires a reason and keeps the item unavailable.
- Reviewer, date and reason are persisted and audited. Retries replay; stale decisions and nonfinanceable proposals cannot publish offers. Rejected proposals cannot be edited/resubmitted in this prototype.
- Read-only invoice forecasts show the signed net rent, invoice-date VAT, issue/due dates and projected totals. VAT changes are marked; early termination removes future rent from the forecast.
- Four-language UI keys, additive generated migration and regression tests are included. Existing local records are preserved; no database reset was run. The overlapping local/team migrations were reconciled using the Prisma-generated chain and a verified row-for-row copy, with a backup retained.

## Smart problems to demonstrate

1. **Lock price, not tax:** signed net rent stays fixed; challenge VAT is resolved at invoice date. Forecasts explain the fictional 2027 change and remain separate from issued invoices.
2. **Money that adds up:** integer cents, explicit rounding, monthly anniversary clamping, leap-year dates and 2,880 deterministic generated schedule cases.

Also implemented: conditional question flow, a documented early-exit cap, required refurbishment, advisory deadline/stable-ID matching and asset passports. Environmental figures use fictional challenge factors.

## Validation

Latest full gate: `npm run check:all` — 318 tests across 55 files, formatting, lint, typecheck, file-size, no-AI scan, coverage and production build.

An isolated SQLite HTTP/render smoke verified customer mutation denials, company sign-in, pending→approval→offer, the full two-customer loop, replay, cards 9/10, buyout and pass-on. User dev.db was not used for the smoke test. The new migration was applied additively to it.

A visual browser/mobile/keyboard review still needs a teammate. Automated rendered HTML is not a visual review.

## Next

1. Follow [UI-LIFECYCLE-WALKTHROUGH.md](UI-LIFECYCLE-WALKTHROUGH.md), including separate operator sign-in and approval.
2. Rehearse the forecast's VAT change and calendar cases.
3. Use [PITCH-OUTLINE.md](PITCH-OUTLINE.md) for the timed four-minute pitch and Q&A. Review and push the local changes, then follow README submission instructions.

## Prototype limits

Development customer switching and shared company password are not production identity or individual staff accounts. The same company session may perform workshop and review actions; no two-person approval policy is claimed. Real payments/credits, rejected-proposal resubmission, multi-asset fleet contracts and persisted waiting-list assignments are not implemented. Historical offers published before the approval gate remain unchanged.

## Approval date fix and clean UI baseline

The company dashboard now sends the latest saved lifecycle date to repair/approval controls instead of the real current date. This prevents demo returns in 2027–2029 from trying to approve work in 2026. A specific safe error explains an approval date before completed work; server validation is retained. Dashboard and future-date integration tests cover it.

At the user’s request, local dev.db was backed up, reset and reseeded. Verified baseline: 30 original synthetic assets, zero applications/contracts/leases/invoices/returns/offers/settlements/command receipts/audit records. Imported returned assets are fixture examples, not leftover UI test records.

## Dark mode and UI polish

Customer and company views now share paired light/dark surfaces, readable controls, consistent buttons, clearer status panels and more spacious invoice tables. Catalogue, account, workshop, language menu and return notifications include dark styling. Shared body/surface/secondary/button text color pairs were checked numerically at or above 4.5:1 contrast. This is not a full accessibility audit; visual browser review remains pending because browser access is unavailable.

## Latest teammate merge: invoices and PDF

Integrated team main `f50304f` (PR 20): invoice browsing by asset, saved invoice viewer/PDF download and active sidebar navigation. Customer end choices, demo completion, company permissions, return notifications, VAT forecasts and dark-mode improvements are retained. Company invoice generation now creates one next invoice per click. PDF access is customer-scoped and errors use the safe API envelope. Invoice pages share the dark palette and show all saved invoices rather than silently truncating the list.

## Five smart problems — current local increment

Target problems 1–5. [SMART-PROBLEMS.md](SMART-PROBLEMS.md) explains each business problem, rule, demo and limitation.

- Price/tax: signed price-list version shown; forecast highlights gross changes across VAT boundaries with unchanged net rent.
- Early exit: owned read-only quote, selectable completed months, remaining-rent calculation, signed cap, dated VAT and explicit confirmation. Issued future rent blocks confirmation pending credits. The settlement recalculates authoritatively.
- Matching: pre-work restored-value projection, as-is baseline, incremental value after work costs, no-demand/cost warnings, ranked candidate explanation and approval gate. Recommendation and ranking are advisory; no fictional waiting-list/customer link is created.
- Questions: existing applicability/pruning/why-we-ask behavior retained; authoritative rejection/manual-review reasons are now localized instead of printing raw server reason strings. Signing returns to My leases.
- Money/calendar: forecast explains full anniversary periods, month-end clamping, calendar-day due dates and half-up VAT rounding; net/VAT/gross totals are shown separately.

Full check passes: 318 tests, production build and all repository checks. An isolated HTTP/render smoke verified read-only preview → identical confirmed fee, pre-work economics rendering, customer request notifications, approval and the second customer's lease/invoice. User dev.db was not changed by this verification. Visual browser/keyboard rehearsal remains pending. This smart-problem increment is included on the team handoff branch.

## Fresh testing baseline

At the user’s request, local dev.db was backed up, reset and reseeded after the five-smart-problem work. Verified: 30 original synthetic assets and zero applications, contracts, leases, invoices, returns, offers, settlements, allocations, command receipts and audit records. Local database files and credentials are excluded from Git.
