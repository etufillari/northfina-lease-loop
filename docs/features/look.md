# The look: tokens, the price tag, life stamps and drawings

## What it does

Gives every page one warm, calm look: cream paper, forest green, terracotta, rounded headings, and three signature pieces taken from the loop itself (the price tag, the life stamp and a drawing per kind of item). It also separates what a customer sees from the demo tools, so the product reads as a product and the back office stays one click away.

## The rule

- **Pages use roles, never colours.** `src/app/globals.css` defines the colours once and maps them to roles (`brand`, `accent`, `success`, `info`, `warning`, `danger`, `staff`, `surface`, `raised`, `muted`, `line`, `ink`…). Each role switches with the colour scheme, so no page needs a `dark:` class and retuning the look is one file.
- **The monthly price is the biggest number on a page** and sits on the price tag (`PriceTag`). The tag's number flips when it changes.
- **A life stamp says which life an item is on** (`LifeStamp`): "Life 1 · New" in forest green; every later life ("Life 2 · Checked") in terracotta. Worked through card 10: `ebike-008` has `previous_lives: 2`, so its card and passport carry "Life 3 · Checked" in terracotta.
- **Every item has a drawing** (`ItemArt`), since the data pack has no photos. `artKindFor(category, model)` picks it from the model name: "Cargo Duo" and "Delivery Pro" are cargo bikes, "Fold Mini" folds, "T-140 Tractor" is a tractor; anything else gets its category's plain drawing.
- **Customer screens and demo tools are apart.** The teal strip above the header holds "Continue as" and the demo page, for everyone; the audit log is opened from the demo page's "Audit log" section (issue #35: a judge acting as a customer still finds the trail). The demo and audit pages say "Back office: customers don't see this page".
- **A link to a section scrolls there on every click** (`HashLink`, and the header's `NavLinks`): Next's router ignores a click on a link whose hash the URL already has, so "How it works" went dead after one click and a scroll back up. On the page it points to, the click scrolls the section into view (instantly under reduced motion), moves focus to it, closes the phone menu and adds a history entry, so Back undoes the jump. Arriving from another page, Next scrolls and `HashTargetFocus` (in the layout) moves focus to the section. `sectionOnPage(href, pathname)` decides which: `/en#how-it-works` on `/en` gives `how-it-works`, on `/en/catalogue` it gives null and the link navigates.
- **The landing page, in three parts** (a layout trial): the headline, centred, and one sentence whose kinds of item ("an e-bike", "a laptop", "a farm machine") are underlined links into their category of the catalogue, with the two buttons; "Why it's greener" with the CO2 numbers; "How it works", the four steps on the left and the end of the term on the right. The category tiles and the end-of-term drawing are gone. The links are cut out of one translated sentence (`home.intro` with `{e_bike}`-style placeholders), so each language keeps its own word order.
- **Accessible by default:** body text 12.8:1 on cream, muted text 6.7:1, input borders 3.9:1, a light focus ring on the teal strip, one `h1` per page, drawings `aria-hidden`, and the tag flip and stamp press stop under reduced motion.

## Decisions

D21 (revised): the palette, the type pair (Nunito, Fredoka), the roles and the signature pieces.

## Pure functions

`artKindFor(category: AssetCategory, model: string): ArtKind` in `src/components/item-art.tsx`: the first rule whose pattern matches the model wins; otherwise the category's fallback. Presentation only; no prices are computed in the UI.

## Files

- `src/app/globals.css`: colours, roles, shadows, the tag and stamp styles, reduced motion.
- `src/components/ui/price-tag.tsx`, `ui/life-stamp.tsx`, `ui/staff-note.tsx`, `ui/disclosure.tsx` (with the catalogue rework), `ui/hash-link.tsx`, `ui/section-hash.ts`, `ui/info-popover.tsx` (a note shown on hover, focus or tap, read as the button's description), `item-art.tsx`, `loop-mark.tsx`, `site-header.tsx`.
- The kit restyled in place: `ui/button.tsx`, `ui/card.tsx`, `ui/field.tsx`, `ui/notice.tsx`, `ui/nav-links.tsx`, `ui/page-header.tsx`.

## Tests that pin the numbers

- `src/components/item-art.test.ts`: the drawing for every model in the pack, the fallbacks, and the first-match rule.
- `src/i18n/messages.test.ts`: the new texts exist in all four languages and none is empty.
- `src/components/ui/badge.test.ts`: every status still has a tone.
- `src/components/ui/section-hash.test.ts`: a section link scrolls on its own page (one trailing slash ignored) and navigates from any other; no hash, an empty one or a malformed escape.

## Open questions

- Fonts come from Google at build time (`next/font/google`); a build without internet fails. Moving them to `next/font/local` with committed files is a later chore.
- The audit page is hidden from the menu for non-admins but not gated; enough for the demo.
