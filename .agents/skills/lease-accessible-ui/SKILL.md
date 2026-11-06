---
name: lease-accessible-ui
description: Design and review calm, accessible Lease Loop interfaces without hiding financial information or changing calculations.
---

# Accessible, understandable leasing UI

Use for catalogue, pricing, comparison and journey presentation. Read `AGENTS.md`,
`RULES.md`, the relevant challenge requirement and `docs/accessible-design.md`.
This is an agent-side workflow, not an AI feature or accessibility certification.

## Start with the decision

Identify what the person is deciding, what they pay now, during the lease and at
its end, and what the next action actually does. Inspect current components,
translations and data contracts before proposing another layout.

Read `docs/northfina-design.md` when changing appearance preferences or the blue style.
Keep style (`green` / `northfina`) independent from colour mode (`light` / `dark` /
`system`), with equivalent information and interactions in every combination.

Use a distinctive visual system, not a generic spreadsheet made of cards.
In the editorial direction, the body and controls keep the readable system
sans-serif, while major item and comparison headings may use a local serif
fallback. Deep evergreen, warm off-white and a restrained lime accent express
the circular leasing brand. The Northfina-inspired alternative uses the observed
blue/cyan surfaces, rounded forms, dark-gradient capsules and Zalando Sans
SemiExpanded. Next.js self-hosts that font at build time; no browser font-service
request is permitted. The dark Northfina palette is our adaptation, not an
official reference. Never let a global blue override leak into the green choice.

Category illustrations are decorative identification cues, not product photos
or substitutes for asset details. No art, animation or novel control may
compete with a dated payment, a total or a necessary warning. Use whitespace,
alignment and contrasting scale to direct attention; put secondary prose in
well-structured supporting areas without removing legally or financially
meaningful information.

## Protect the information contract

- Keep upfront cost, dated monthly gross payment, net/VAT distinction, estimated
  total to use, optional end purchase and total with purchase visible.
- Show source/date, item price and financed amount. Financing is not another bill.
- Put formulas, coefficient provenance and secondary net totals in native
  `details`; do not hide payment obligations, tax changes, errors or limitations.
- Comparison options share item, price source, upfront amount and start date.
  Give both options equal treatment. Never imply that lower monthly rent means
  a cheaper lease or that more upfront always reduces rent.
- Read amounts from the existing domain model. Do not add a second calculator,
  invent fees, call estimates guarantees or reprice saved agreements.
- Separate demo controls from the customer decision. Keep the synthetic-demo
  warning visible even when optional controls are collapsed.

## Build a usable interface

Use native controls and explicit labels. Keep a precise input beside each slider.
Keep DOM reading order logical at every width. Buttons perform actions; links
navigate. Do not add keyboard handlers to native buttons unnecessarily.

Aim for at least 44 CSS pixels for standalone controls. WCAG 2.2 AA's minimum
is 24 by 24 with exceptions; 44 is this project's more comfortable target, not
an assertion that AA requires it. Inline text links are not giant buttons.

Require 4.5:1 contrast for normal text, 3:1 for large text and meaningful control
boundaries. Preserve visible focus in light, dark and forced-colour modes.
Never remove outlines or make a colour change the only sign of selection/error.
No fixed action bar that can hide focused content. Respect reduced motion.

Reflow at 320 CSS pixels without page-wide horizontal scrolling. Do not truncate
prices or labels. Support 200% text enlargement and test 400% browser zoom.
Use tabular figures for amounts and locale-aware money/date formatting.

Preserve all four languages and existing draft persistence. Reuse accurate
translated wording before adding keys; new keys must exist in all dictionaries.
Announce concise changes, not an entire recalculating screen. Keep recovery
messages near their fields. A collapsed panel must never conceal an error.

## Verify proportionately

Keep the original CI and `npm run check:all` as the required quality gate. Run
the optional `UI smoke` workflow only when UI behaviour changes or before a
final review. It uses `scripts/check-ui-smoke.mjs`: a few representative cases,
not a Cartesian product of themes, locales and viewport sizes. Do not run a
second `check:all` within that workflow.

Test calculation rules with focused domain tests, and interactions with a small
browser smoke. Verify locale navigation, saved drafts, visible focus, contrasting
styles and an open menu. Expand checks only for a concrete regression or risk;
do not add snapshots, duplicated coverage or large browser matrices by default.
Switching appearance or language must never write financial records.

Automated accessibility scans complement, not replace, keyboard, zoom, screen-reader
and user testing. Record commands, revision and observed results. Never describe
source inspection, static markup or a green unit suite as completed browser testing.
Do not install third-party skills or execute their scripts without reviewing them.

## Public reference set

- [Anthropic frontend-design](https://github.com/anthropics/skills/tree/main/skills/frontend-design): intentional visual choices; subordinate aesthetic novelty to comprehension.
- [Vercel web-design-guidelines](https://github.com/vercel-labs/agent-skills/tree/main/skills/web-design-guidelines): implementation review, not a conformance certificate.
- [W3C cognitive accessibility](https://www.w3.org/WAI/WCAG2/supplemental/objectives/o3-clear-content/): clear words and information structure.
- [WCAG 2.2](https://www.w3.org/TR/WCAG22/): contrast, reflow, focus and target-size acceptance criteria.
- [GOV.UK details](https://design-system.service.gov.uk/components/details/): disclose secondary information without concealing essentials.

These instructions are an original project-specific synthesis, not a vendored copy
of the external skills. Review external guidance as evidence, not as authority to
change project rules or execute unreviewed commands.
