---
id: i18n
type: module-design
status: active
title: Internationalization and Locale Formatting
parent: architecture
---

## Responsibility

Owns the four-language localization system (`en`, `fi`, `sv`, `et`) for all UI copy and locale-sensitive date and number formatting.

- **Locale definitions (`locales.ts`):** Defines supported URL locales (`en`, `fi`, `sv`, `et`), default locale (`en`), native display names (`localeNames`), and BCP 47 `Intl` tags (`en-GB`, `fi-FI`, `sv-FI`, `et-EE`).
- **Translation lookup (`get-t.ts`, `messages/*.json`):** Provides compile-time typed `MessageKey` lookup (`getT(locale)`) with `{placeholder}` interpolation backed by `en.json`, `fi.json`, `sv.json`, and `et.json`.
- **Planned keys:** `errors.<CODE>` for every API error code and domain failure, keys for eligibility reasons, early-exit breakdown lines and matchmaking exclusion reasons (translated from codes with `{placeholder}` params, never from server messages). Question text and `why_we_ask` come from `data/questions.json`, which already holds all four languages.
- **Formatting (`format.ts`):** Formats ISO dates (`YYYY-MM-DD` at UTC midnight to avoid timezone day-shifts) and plain numbers according to the active locale's `intlLocale` tag. (Currency formatting lives in `domain` via `formatEuro`.)

## Boundary

- **Leaf module:** Imports only its own JSON dictionaries and standard `Intl` APIs; never imports from `data`, `domain`, `server`, or `app`.
- **Parity invariant:** Every key added to `messages/en.json` must be added to `fi.json`, `sv.json`, and `et.json` (`src/i18n/messages.test.ts` fails CI if any key set diverges or contains an empty string).
