# Editorial price design — visual iteration

Branch: `feat/editorial-price-design`, based on `feat/accessible-price-design`.
This is a second visual direction following feedback that the accessible-first pass
felt too generic and text-heavy.

## Design position

A leasing service should feel like a product, not a spreadsheet.

- **Asset first.** The header and catalogue use category-specific vector art and a
  clear product name. These are illustrations, not misleading stock photos; make,
  model, condition and previous lives remain textual and authoritative.
- **One dominant price.** The dated first payment including VAT is the visual
  centerpiece. Rich evergreen and lime provide stronger contrast and identity.
  Net rent, tax changes and use/buy totals remain readable outside the hero.
- **Editorial, not ornamental.** A local serif fallback adds character to the
  asset name and comparison headings. System sans-serif remains on dense
  explanations, labels, numbers and controls. No network font request is required.
- **Choices, not cards everywhere.** Separate the terms workbench from the two
  outcomes (use, or optionally buy). Comparison remains a pair of equivalent
  choices, and saving a quote remains a separate action.
- **Less persistent prose.** Generic financing-band guidance is a native
  disclosure, but the specific alert for a changed coefficient/band remains
  immediately visible.

## Information and accessibility contract

The earlier accessible-first implementation remains the baseline. This visual
iteration does not modify the pricing, coefficient, VAT, quote, invoice, persistence,
API or contract code. Keep all four languages and existing money/date formatting.
Date-dependent amounts, obligations, error messages and the distinct purchase
outcome must remain visible. Do not invent discounts, savings or promises.

Keep native controls, clear labels, 44+ px targets, strong keyboard focus, reduced
motion, dark scheme, forced-colors behavior and browser zoom/reflow coverage.
Decorative SVG art has `aria-hidden` and `focusable="false"` and carries no
required information.

## Review notes

Contrast ratios, calculated from proposed hex values (not a browser audit):

- Headline lime `#d9f78b` on green `#166249`: about **6.13:1**.
- Hero light text `#f4f9eb` on bright gradient stop `#216f56`: **5.64:1**.
- Hero secondary text `#e1eddc` on `#216f56`: **5.00:1**.
- Main text `#173b31` on page `#f7f8f1`: **11.52:1**.
- Accent `#135d45` on white: **7.84:1**.

These values are only specific color pairs. They do not establish WCAG
conformance. Re-run the existing GitHub Actions checks, inspect the actual
320px/1280px layouts and test keyboard, zoom, light/dark, four locales and
screen-reader reading order before merging. The visual branch was edited
through the GitHub connector; local Git hooks and a local app server were
not run during this iteration.

## Source map

- `src/components/asset-art.tsx`: decorative category drawings.
- `src/components/spine/journey.tsx`: product-led hero.
- `src/components/asset-card.tsx`: recognizable catalogue items.
- `src/components/spine/price-panel.tsx`: step heading, expandable explanation.
- `src/components/spine/price-explanation.tsx`: differentiated outcomes.
- `src/components/spine/price-comparison.tsx`: emphasized term selection.
- `src/app/editorial.css`: additive visual layer; base semantics and interaction
  rules stay in `src/app/globals.css`.

The previously researched WCAG 2.2, W3C cognitive-accessibility, GOV.UK details,
Vercel design guidelines and Anthropic frontend-design references are listed in
`docs/accessible-design.md` and the project UI skill.
