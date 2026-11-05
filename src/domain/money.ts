// Money helpers. Amounts are always integer euro cents; only format at the edge (the UI).

/**
 * Formats cents as euros for a locale, e.g. 189900 → "1 899,00 €" (fi) or "€1,899.00" (en).
 * `locale` is a BCP 47 tag such as "fi", "fi-FI" or "en-GB".
 */
export function formatEuro(cents: number, locale: string): string {
  if (!Number.isInteger(cents)) {
    throw new RangeError(`cents must be a whole number, got ${cents}`);
  }
  return new Intl.NumberFormat(locale, { style: 'currency', currency: 'EUR' }).format(cents / 100);
}

/**
 * Rounds a computed amount to whole cents, half away from zero. Use it at every rounding
 * point (rent, VAT, buyout) so the app has exactly one rounding rule.
 *
 * Trims float noise first: 163 845 × 0.7 is 114 691.49999… in floating point, but the true
 * value is an exact half and must round to 114 692.
 */
export function roundHalfUp(amount: number): number {
  if (!Number.isFinite(amount)) {
    throw new RangeError(`amount must be a finite number, got ${amount}`);
  }
  const trimmed = Number(amount.toFixed(6));
  return Math.sign(trimmed) * Math.round(Math.abs(trimmed));
}

/**
 * Parses a euro amount typed by a person ("3200", "3 200,50", "1.10") to whole cents using
 * string arithmetic, so no float ever touches the amount. Returns null for anything else.
 */
export function parseEuros(text: string): number | null {
  const match = /^(\d+)(?:[.,](\d{1,2}))?$/.exec(text.replace(/\s/g, ''));
  if (!match?.[1]) return null;
  const cents = Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0'));
  return Number.isSafeInteger(cents) ? cents : null;
}
