// Locale-aware formatting for the UI. For money use formatEuro from @/domain/money.
//
// Dates have ONE look everywhere (docs/DECISIONS.md): day first, European style.
// - Shown: "06 Nov 2026" — two-digit day, three-letter month in the reader's language,
//   four-digit year. Never ambiguous (no 06/11 vs 11/06), always the same width.
// - Typed: "06.11.2026" — the Nordic numeric form, in our own field, because a browser's
//   built-in date input formats by the BROWSER's language (mm/dd/yyyy on a US browser).
// - Stored and sent: ISO "2026-11-06", as everywhere in the code.
import { isIsoDate } from '@/domain/calendar';
import { intlLocale, type Locale } from './locales';

/** Three-letter month names per locale. */
const MONTHS_3: Record<Locale, readonly string[]> = {
  en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
  fi: ['tam', 'hel', 'maa', 'huh', 'tou', 'kes', 'hei', 'elo', 'syy', 'lok', 'mar', 'jou'],
  sv: ['jan', 'feb', 'mar', 'apr', 'maj', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'],
  et: ['jaa', 'vee', 'mär', 'apr', 'mai', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'det'],
};

/** `2026-11-06` → "06 Nov 2026" (en) / "06 mar 2026" (fi). The one way dates are shown. */
export function formatIsoDate(isoDate: string, locale: Locale): string {
  const [year, month, day] = isoDate.slice(0, 10).split('-');
  return `${day} ${MONTHS_3[locale][Number(month) - 1]} ${year}`;
}

/** `2027-01` → "Jan 2027" (a calendar month, e.g. the month a payment limit is exceeded). */
export function formatMonth(yearMonth: string, locale: Locale): string {
  const [year, month] = yearMonth.split('-');
  return `${MONTHS_3[locale][Number(month) - 1]} ${year}`;
}

/** A timestamp → "06 Nov 2026 14:05", in Helsinki time (the audit log). */
export function formatDateTime(timestamp: string | Date, locale: Locale): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Helsinki',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(timestamp));
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? '';
  const iso = `${part('year')}-${part('month')}-${part('day')}`;
  return `${formatIsoDate(iso, locale)} ${part('hour')}:${part('minute')}`;
}

/** `2026-11-06` → "06.11.2026", how a date is shown in a field the customer types in. */
export function formatDateInput(isoDate: string): string {
  if (!isIsoDate(isoDate)) return '';
  const [year, month, day] = isoDate.split('-');
  return `${day}.${month}.${year}`;
}

/**
 * What the customer typed → ISO, or null if it is not a real date. Day first, always:
 * "6.11.2026", "06/11/2026", "6-11-2026" and "6 11 2026" all mean 6 November 2026.
 */
export function parseDateInput(text: string): string | null {
  const match = /^\s*(\d{1,2})[./\- ](\d{1,2})[./\- ](\d{4})\s*$/.exec(text);
  if (!match) return null;
  const iso = `${match[3]}-${match[2]!.padStart(2, '0')}-${match[1]!.padStart(2, '0')}`;
  return isIsoDate(iso) ? iso : null;
}

/** 18400 → "18,400" (en) / "18 400" (fi). */
export function formatNumber(value: number, locale: Locale): string {
  return new Intl.NumberFormat(intlLocale[locale]).format(value);
}
