// Locale-aware formatting for the UI. For money use formatEuro from @/domain/money.
import { intlLocale, type Locale } from './locales';

/** `2026-11-06` → "6 November 2026" (en) / "6. marraskuuta 2026" (fi). */
export function formatIsoDate(isoDate: string, locale: Locale): string {
  return new Intl.DateTimeFormat(intlLocale[locale], { dateStyle: 'long', timeZone: 'UTC' }).format(
    new Date(`${isoDate}T00:00:00Z`)
  );
}

/** 18400 → "18,400" (en) / "18 400" (fi). */
export function formatNumber(value: number, locale: Locale): string {
  return new Intl.NumberFormat(intlLocale[locale]).format(value);
}

/** Three-letter month names per locale, so a short date always has the same width. */
const MONTHS_3: Record<Locale, readonly string[]> = {
  en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
  fi: ['tam', 'hel', 'maa', 'huh', 'tou', 'kes', 'hei', 'elo', 'syy', 'lok', 'mar', 'jou'],
  sv: ['jan', 'feb', 'mar', 'apr', 'maj', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'],
  et: ['jaa', 'vee', 'mär', 'apr', 'mai', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'det'],
};

/**
 * `2026-11-06` → "06 Nov 2026": a fixed-width date (two-digit day, three-letter month) for
 * places where the text must not jump around as the date changes, like the demo bar.
 */
export function formatShortDate(isoDate: string, locale: Locale): string {
  const [year, month, day] = isoDate.split('-');
  return `${day} ${MONTHS_3[locale][Number(month) - 1]} ${year}`;
}
