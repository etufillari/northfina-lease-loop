# Lease Loop UI and UX guidelines

Lease Loop should feel calm, clear and easy to scan. A customer should be able to
understand what an item is, what they will pay and what they can do next without
reading a wall of details. Give important information room to breathe.

These guidelines apply to the catalogue, product pages, application, contracts and
customer dashboard. They complement `DESIGN.md`, which documents visual tokens and
an Apple-inspired reference. **Use this file for Lease Loop's information hierarchy,
content width and interaction decisions when the two documents differ.** Keep the
engineering and challenge requirements in `AGENTS.md`, `RULES.md` and `CHALLENGE.md`.

## What the reference gets right

The example marketplace screenshot uses a centered content area with generous side
margins. Four image-led items sit in a consistent grid. Each item has a short title,
a prominent price and a quieter line of supporting information. The images have
rounded corners, while the surrounding card has very little visible decoration.

The important lesson is the **hierarchy**, not an exact copy: one main thing to look
at, a small amount to read, and a clear next step. Preserve this calm feeling when
adapting it to leasing, where customers also need accurate payment and contract details.

## 1. Give content a comfortable width

- Center the main content. For catalogue and dashboard grids, aim for a maximum
  width around **1,140–1,200 px**; let large screens have generous side margins.
  Text-heavy sections should be narrower, generally **60–75 characters per line**.
- Use at least 16–24 px of side padding on small screens. Avoid horizontal page
  scrolling; navigation may scroll horizontally if it remains clearly usable.
- Keep a consistent grid and alignment. As a starting point, use one column on a
  narrow phone, two on larger phones/tablets, three on smaller desktops and four
  when the content area comfortably fits them. Never squeeze cards to reach a count.
- Use spacing to separate groups: roughly 20–24 px between cards, 32–48 px between
  related sections and more space around a major page introduction when useful.
  Adapt the spacing to the content and screen size rather than forcing empty space.
- Backgrounds may extend edge to edge, but their content stays aligned to the same
  centered container. Prefer a light, consistent canvas for browsing and account
  tasks. Use dark sections sparingly, for a clear purpose, rather than alternating
  every category simply for decoration.

## 2. Give every screen a clear job

Before designing a screen, answer:

1. What is the person's main question here?
2. What is the one most useful next action?
3. Which information is needed to make that decision now?

Show that information first. Put helpful but less urgent details in clearly named
sections further down the page or behind an accessible disclosure. Avoid showing the
same heading, explanation, badge or action in several places on the same screen.

**Do not hide information needed for an informed financial decision.** A customer
must be able to find the applicable monthly payment, VAT treatment, term, down payment,
total cost, buyout and relevant conditions before agreeing to a lease. Disclosures are
acceptable for detail, but the key price and commitments must remain visible at the
decision point. Always identify estimates and simulated data.

## 3. Make the catalogue easy to scan

The catalogue's job is to help someone recognize and compare items. A card should
normally show, in this order:

1. **Image:** large and consistent across the grid.
2. **Item name:** make and model, in a short readable heading.
3. **Price:** the most useful available price with its period and VAT qualifier.
4. **One short supporting detail when it matters:** for example, used condition or
   a status such as reserved/returned. Make unavailable items visibly distinguishable.

Condition, usage, model year, previous lives, price-list version and other facts can
live on the product page unless they are necessary for a particular comparison. Avoid
repeating “available” on every available item. A short shared explanation can replace
repeated explanatory captions, provided it remains clear which images are illustrative
and the applicable photo credits and license information remain easy to find.

The card should have one obvious route to the product page. If the card itself is the
link, keep any separate photo-credit link outside it; never nest interactive elements.
Make the link keyboard accessible and give it a visible focus state. Do not make an
item look leasable when its status or eligibility prevents that action.

**Price truth:** today's catalogue currently has a net list price. Label it as such;
do not call it a monthly rent or add “/month”. When a real monthly quote is available,
prefer the monthly total including VAT, with its term and any meaningful “from”
qualification. Never invent a price, discount or availability to make a card cleaner.

## 4. Use progressive detail on the product page

- Start with the item image, name, condition/availability and the price or quote that
  matters now. On desktop, place imagery and the quote area side by side when space
  permits; stack them on mobile.
- Group the term, down payment, calculated monthly payment and main action together.
  Show whether the displayed amount includes VAT, and update the calculation when
  the customer changes the options. Keep the action near the information it depends on.
- Follow with clearly titled sections for the price breakdown, specifications,
  condition and usage, item's history and what happens at the end of the lease.
- Use concise labels and plain language. For example, “Monthly payment including VAT”
  is clearer than a bare amount with an unexplained acronym. Explain unfamiliar terms
  where they first matter, not in a long paragraph before the user can act.
- Product images in the current data pack are illustrative photos of fictional models,
  not photographs of the actual item. Say so without letting the note dominate the card;
  keep source and license credits accessible.

## 5. Make the dashboard answer the next question

On account pages, lead with **what needs attention**, then the customer's leases and
next relevant payment. Use a small number of meaningful summary values; hide a metric
when it has no useful data rather than filling the page with empty boxes. Keep profile
and security settings accessible without placing them between the user and their leases.

Each lease card should prioritize the item, status, next amount/date when available,
and a clear link to details. Progress, history and secondary facts can follow on the
detail page. Do not show more than one prominent action per section.

For bills, distinguish **issued**, **forecast**, **paid**, **partly paid** and
**overdue**. “Paid” means a recorded payment; an issued invoice or projected rent is
not a payment. Clearly mark demo leases and simulated payments. Explain a VAT change
next to the affected invoice, while making clear that the agreed net rent stays locked.

Return, buyout and exchange controls must describe their actual effect. If an action
only sends a request for review, say so before submission and show its status afterward.
Do not suggest that a lease has ended, a replacement is reserved, or a fee is final
until that has actually happened. Offer a sensible empty state with a next step.

## 6. Keep visual emphasis and copy restrained

- Use a clear type hierarchy: a page title, section headings, body text, then quieter
  supporting text. Body text should remain comfortable to read; the existing design
  tokens target 17 px with generous line-height. Avoid shrinking essential information
  to make a busy layout fit.
- Align text consistently, usually left for content and numbers. Use weight and space
  before adding another box, border, badge, divider or color. Prices and action-needed
  states may be emphasized; not everything can be visually primary.
- Use one primary action per screen or decision area. Secondary links should be easy
  to find but quieter. Avoid making every sentence, card and icon a competing action.
- Prefer short, specific headings, labels and buttons. Show useful explanations in a
  sentence or two; reserve long explanations for the place they are actually needed.
- Do not repeat developer-facing concepts in customer UI. Technical identifiers,
  price-list versions and setup instructions belong in detail views or appropriate
  developer/admin contexts unless they help the customer make a decision.
- Use representative photos consistently and preserve recognizable product proportions.
  A photograph may be cropped for a card only if the important subject stays visible.

## 7. Design for different people and screens

- Use semantic headings, landmarks, labels, buttons and links. Support keyboard use,
  visible focus, screen readers and touch targets of at least 44 × 44 px where practical.
- Maintain readable contrast for text, icons and focus indicators. Do not rely on color
  alone to communicate status; include text or another meaningful cue.
- On mobile, stack content in the same priority order, use comfortable padding and
  let labels wrap. Avoid tiny controls, clipped text, fixed-width price blocks and
  sticky bars that cover content or the keyboard.
- Put UI strings in all four translation files. Allow extra room for Finnish, Swedish
  and Estonian text, and use locale-aware date and euro formatting.
- Respect reduced-motion preferences. Do not require hover to find essential content.

## 8. Review before shipping a screen

- At a glance, can someone identify the item, key amount and next action?
- Is each visible detail useful for this decision, and is any important term missing?
- Are real, estimated, issued, paid and simulated values clearly distinguished?
- Does the layout stay readable at phone, tablet and wide desktop sizes, including
  long translations and large text?
- Can the screen be used with a keyboard, and are focus and status visible?
- Have images, empty states, unavailable items, validation and error states been
  considered without overloading the normal path?

Use this guide for new work and improve existing screens as they are touched. It is
not a request to redesign the whole application at once.
