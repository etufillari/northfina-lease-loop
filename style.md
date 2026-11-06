# Lease Loop UI style guide

## Visual direction

- Use a trustworthy B2B dashboard style: deep navy navigation, cool gray workspace, and white cards.
- Keep layouts spacious, calm, and information-dense without visual clutter.
- Use the existing sans-serif system font stack; do not introduce a decorative font.

## Color palette

- Primary navy: `#101d46`
- Workspace gray: `#f3f6fa`
- White surface: `#ffffff`
- Body text: slate `#0f172a`
- Muted text: slate `#64748b`
- Available/success: emerald
- Warning/reserved: amber
- Error/validation: red

Use Tailwind utility classes and reuse these semantic colors consistently. Avoid one-off colors.

## Layout

- Desktop navigation is a fixed `100dvh` sidebar, 16rem wide.
- The main workspace must use a matching desktop left margin and remain full-width.
- Mobile layouts hide the desktop sidebar and must keep navigation accessible.
- Cards use rounded corners, subtle borders, and restrained shadows.

## Components

- Primary actions use deep navy buttons with white text.
- Available status uses a compact green badge.
- Keep important controls aligned and visually stable when errors appear.
- Use visible focus styles for keyboard users.
- Decorative icons may be non-functional, but interactive controls need accessible labels.

## Content and behavior

- UI strings belong in all four locale files: English, Finnish, Swedish, and Estonian.
- Preserve existing pricing, filtering, reservation, audit, and account behavior during visual work.
- Do not add AI, ML, or external AI services.
- Prefer real data and intentional empty states over placeholder success states.

## Validation

Before completing a UI change, run:

```bash
npm run check:all
```
