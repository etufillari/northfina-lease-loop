// Locale-aware formatting for the UI. For money use formatEuro from @/domain/money.
import { intlLocale, type Locale } from './locales';

/** `2026-11-06` → "6 November 2026" (en) / "6. marraskuuta 2026" (fi). `medium` is for tables. */
export function formatIsoDate(
  isoDate: string,
  locale: Locale,
  dateStyle: 'long' | 'medium' = 'long'
): string {
  return new Intl.DateTimeFormat(intlLocale[locale], { dateStyle, timeZone: 'UTC' }).format(
    new Date(`${isoDate}T00:00:00Z`)
  );
}

/** A moment as it reads in Finland, wherever the server runs: "6 Nov 2026, 12:30". */
export function formatDateTime(isoDateTime: string, locale: Locale): string {
  return new Intl.DateTimeFormat(intlLocale[locale], {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Europe/Helsinki',
  }).format(new Date(isoDateTime));
}

/** 18400 → "18,400" (en) / "18 400" (fi). */
export function formatNumber(
  value: number,
  locale: Locale,
  options?: Intl.NumberFormatOptions
): string {
  return new Intl.NumberFormat(intlLocale[locale], options).format(value);
}
