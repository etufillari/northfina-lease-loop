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
 * Parses what a person types for an amount of euros ("2500", "2 500,50", "2500.5") into whole
 * cents, or null if it is not an amount. Works on the digits as text, never through a float, so
 * "0.29" is exactly 29 cents. Negative numbers, more than two decimals and absurdly large
 * amounts are rejected.
 */
export function parseEuroToCents(input: string): number | null {
  const match = /^(\d+)(?:[.,](\d{1,2}))?$/.exec(input.replace(/\s/g, ''));
  if (!match) return null;
  const cents = Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0'));
  return Number.isSafeInteger(cents) ? cents : null;
}
