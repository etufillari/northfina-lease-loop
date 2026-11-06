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
 * Parses a user-entered euro amount into integer cents without doing arithmetic on a
 * floating-point euro value. One or two decimal places are accepted.
 */
export function parseEuroCents(value: string): number | undefined {
  const normalized = value.trim().replace(',', '.');
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) return undefined;

  const [wholePart = '0', decimalPart = ''] = normalized.split('.');
  const cents = BigInt(wholePart) * 100n + BigInt(decimalPart.padEnd(2, '0'));
  return cents <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(cents) : undefined;
}
