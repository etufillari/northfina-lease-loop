# A calm, understandable price journey

Reviewed 5 November 2026. Base: `3490b61` on `main`.
Branch: `feat/accessible-price-design`.

## Research and skill choices

**Anthropic frontend-design** contributes deliberate hierarchy and coherent visual
choices instead of a generic collection of cards. Decorative typography, animation
and novelty are not goals here: keep the system font and familiar native controls.

**Vercel web-design-guidelines** contributes implementation checks for semantics,
focus, forms, motion and layout. A checklist is not an accessibility certificate or
permission to change financial behavior.

**Existing plan-ux-content and lease-ux-demo preparation skills** contribute
decision-first content order, consistent vocabulary, four locales and honest demo
states. Apply them to the current app, not a retired prototype or hypothetical policy.

**The new lease-accessible-ui skill** combines those methods with W3C cognitive
accessibility, WCAG 2.2 and GOV.UK disclosure guidance. Its path is
`.agents/skills/lease-accessible-ui/SKILL.md`. It is an original project-specific
instruction file, not an AI feature or a copied third-party package. External
installers were not run and external skills were not copied wholesale.

## Decisions implemented

**Answer the decision before explaining the mechanics.** Show what is paid upfront,
monthly and over the whole lease. Distinguish total to use, optional end purchase
and total with purchase. Keep VAT changes, forecast assumptions, item price,
financed amount and price source/date visible. Financing is not an extra bill.
Only formulas, coefficient provenance and secondary net totals are disclosed on
request. A low monthly amount is not presented as evidence of a cheap lease.

**A single visual family.** Retain the locale shell, system font, stone surfaces and
emerald accents. Use whitespace, alignment and a clear typographic hierarchy rather
than another border around every sentence. Centralize only genuinely repeated
presentation patterns. No font service or new component framework is introduced.

**Comparable options without sideways scrolling.** Two consistently labeled options
sit side by side on wide screens and stack on narrow screens. Both use the same
item, price source, upfront payment and start date. Selection has a text label,
not just a color. There are no invented savings or recommended-plan badges.
Choosing another term changes the draft; saving remains a separate primary action.

**Recognizable, usable controls.** Native sliders retain precise text/select
alternatives. The price panel is a labeled form with normal keyboard submission.
Invalid input keeps its entered value, shows recovery beside the controls and clears
the invalid estimate. No stale price remains eligible for saving.

**Readable and reachable.** Standalone controls target at least 44 CSS pixels;
inputs and buttons use 48. This is a project choice above WCAG 2.2 AA's 24-pixel
minimum with exceptions, not a claim that AA requires 44. The interface has a
three-pixel focus outline, system dark mode, forced-color and reduced-motion support.
No fixed action bar covers focused content. Translated labels and large amounts wrap.

**The same financial model.** No domain, tax, API, database or saved-offer rules are
changed. Values still come from the integer-cent model, and existing translations
and locale-aware formatting remain authoritative in en, fi, sv and et.

## Implementation map

- `src/app/globals.css`: colors, shared presentation, reflow and accessibility states.
- `src/components/spine/ui.tsx`: shared fields, buttons, panels and money facts.
- `src/components/spine/price-panel.tsx`: form controls and inline recovery.
- `src/components/spine/price-explanation.tsx`: payments versus calculation details.
- `src/components/spine/price-tax-timeline.tsx`: explicit dated payment changes.
- `src/components/spine/price-comparison.tsx`: responsive, comparable term options.
- `src/components/asset-card.tsx`: catalogue continuity and readable item facts.
- `scripts/check-ui-smoke.mjs`: small, optional browser smoke for key UI behaviours.

## Verification boundaries

The unchanged core CI is the required quality gate and runs automatically.
The extra `UI smoke` workflow is manual-only: it builds an isolated synthetic
demo and checks a few meaningful browser interactions without repeating the entire
quality gate. Playwright and axe-core stay outside application dependencies.

The old large browser matrix was retired after the original accessible-first
iteration. It is neither required for each push nor evidence for the current
revision. Automated scans and a green build do not establish WCAG conformance,
screen-reader usability or comprehension by real users; review those manually
when needed.

Commits were created through the GitHub connector. Its contents API does not execute
local Git hooks; no hook or CI check was disabled. The editing environment could not
resolve GitHub directly, so no local application build is claimed. Remote checks
are distinct from local execution.

## Primary sources

- [Anthropic frontend-design](https://github.com/anthropics/skills/blob/main/skills/frontend-design/SKILL.md).
- [Vercel web-design-guidelines](https://github.com/vercel-labs/agent-skills/blob/main/skills/web-design-guidelines/SKILL.md) and [review rules](https://github.com/vercel-labs/web-interface-guidelines/blob/main/command.md).
- [W3C clear content](https://www.w3.org/WAI/WCAG2/supplemental/objectives/o3-clear-content/) and [findable important information](https://www.w3.org/WAI/WCAG2/supplemental/patterns/o2p04-page-important/).
- [GOV.UK details component](https://design-system.service.gov.uk/components/details/).
- [WCAG text contrast](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html), [non-text contrast](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html), [target size](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html), [reflow](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html) and [unobscured focus](https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured-minimum.html).
- [Playwright accessibility testing](https://playwright.dev/docs/accessibility-testing).
