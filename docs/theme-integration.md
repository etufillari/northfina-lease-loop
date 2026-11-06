# Theme integration on the current spine

Integration branch: `integration/northfina-theme-main`.
Base: `main` at `99246cc` (6 November 2026).

This integration deliberately starts from the latest customer/dealer and second-life
workflows, rather than merging the old monolithic Journey from the theme branch.

## Conflict decisions

- **Journey:** retain the 18-line role router from `main`. The previous
  product-led header is now a shared, presentation-only `AssetHero` used by
  `CustomerJourney` and `DealerJourney`. Neither role, waiting lists, signing
  nor second-life business logic is copied from the older theme branch.
- **Translations:** combine the `workflow` and `appearance` dictionaries in
  `get-t.ts` for all four locales. Keep every new key already present on `main`;
  add only `explain.bandInfoSummary` from the design branch.
- **History:** keep the role-scoped audit context from `main`, while retaining
  the labelled, keyboard-reachable horizontal audit-table scroller.
- **Price and catalogue:** use the established, accessible visual components
  without changing the money, VAT, eligibility, invoice or API code.
- **Appearance:** the independent Green/Northfina style and
  Light/Dark/System choice remain local browser preferences. The current item,
  draft and selected demo persona are not changed by appearance switches.

## Verification policy

Core GitHub CI is the required check for every push and PR, including
`npm run check:all` and commit messages. The UI smoke workflow is optional,
manually dispatched, and checks representative interaction cases in Chromium.
It does not repeat the full quality gate or run an exhaustive combination matrix.

A green CI on the unmerged branches alone does not prove compatibility.
Check the integration branch's own CI and browser smoke separately.
Human review remains necessary for screen readers, real-device zoom and content
comprehension. Do not conflate automatic axe checks with WCAG certification.

## Review

The original PR #8 is not intended to be merged directly: it still represents
the old split history and conflicting Journey/i18n implementation.
Review the integration diff against current main instead.
