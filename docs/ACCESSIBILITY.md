# Accessibility

Lease Loop aims for **WCAG 2.1 AA** in all four languages, in light and dark mode.

## What is checked automatically

`npm run test:e2e` (also run in CI) opens the real app in headless Chrome and, on every main page:

- runs **axe-core** against the WCAG 2.1 A and AA rules. Any violation fails the run.
- checks what a screen reader depends on beyond axe:
  - `<html lang>` matches the page's language, so the voice reads Finnish as Finnish.
  - The page has exactly one `<h1>` to jump to.
  - The page has a title.
  - A skip link leads to `<main id="main">`.

The pages checked are the catalogue (en and fi), an item, the application form (as a guest and prefilled as Aino), fleet leasing, contracts, a contract, an invoice, the payment page, the early-exit page, notifications, admin, and the second-life list and workbench. Four of them are checked again in dark mode, which has its own colours.

```bash
npm run build
npm run test:e2e -- a11y        # only the accessibility pass
npm run test:e2e                # every scenario card + accessibility
```

The first run found small grey text (`text-stone-500`) below the 4.5:1 contrast ratio on several pages and in dark mode. It now uses the same `stone-600` / `stone-400` as the rest of the secondary text.

Automated tools find roughly a third of real problems, so also try the app the way people use it.

## Testing with a screen reader yourself

### Windows: Narrator (built in) or NVDA (free)

- **Narrator:** press **Ctrl + Win + Enter** to turn it on or off.
- **NVDA:** install it from [nvaccess.org](https://www.nvaccess.org/). **Ctrl + Alt + N** starts it, and **Insert + Q** quits.

Useful keys (Narrator uses **Caps Lock** as its key, NVDA uses **Insert**):

| What                          | Narrator       | NVDA        |
| ----------------------------- | -------------- | ----------- |
| Read from here                | Caps Lock + R  | Insert + ↓  |
| Stop talking                  | Ctrl           | Ctrl        |
| Next heading                  | H              | H           |
| Next form field               | F              | F           |
| Next landmark (header, main…) | D              | D           |
| List all headings or links    | Caps Lock + F6 | Insert + F7 |

### macOS: VoiceOver

Press **Cmd + F5**. Use **Ctrl + Option + U** for the rotor (headings, links, form controls).

### A five-minute script for this app

1. **Open the catalogue.** Press **Tab** once. "Skip to content" should be the first thing you hear. Press Enter, and you land on the list.
2. **Press H.** You hear the page heading, then each item's name.
3. **Switch the language to Suomi.** The voice should change to Finnish pronunciation, because the page's `lang` changes.
4. **Open an item and move the term and down-payment sliders with the arrow keys.** You should hear the new value, and the monthly price updates.
5. **Apply** (choose "Acting as: Aino Virtanen" in the header first). Move through the form with **F**. Each question reads its label and its "why we ask" text. When you answer, the decision box ("Yes! You can lease this item.") is announced without moving focus, because it is a polite live region.
6. **Choose "Acting as: Mikko Laine"** and apply for laptop-008. The decline and its kind reason are read out.
7. **On a contract, use "End the lease early".** The calculation is a list of label/value pairs, and each line reads as "Still owed today, 3,306.66 euros".

### Keyboard only (no screen reader)

Put the mouse away:

- **Tab** and **Shift + Tab** move through everything, and the focus ring is always visible.
- **Enter** and **Space** activate controls.
- Arrow keys move sliders and radio buttons.

Nothing should need a mouse.

### In Chrome DevTools

- **Elements → Accessibility pane** shows the name, role and state a screen reader gets for any element.
- **Lighthouse → Accessibility** gives a quick second opinion.
- **Rendering → Emulate CSS prefers-color-scheme: dark** checks dark mode.
- **Rendering → Emulate vision deficiencies** shows colour-blind views. Statuses never rely on colour alone; they always have a word ("Paid", "Due").
