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

// ---------------------------------------------------------------------------
// Rounding rule for the whole app: every money calculation rounds ONCE, half up, to a whole
// cent, using integer maths only. Percentages and factors are scaled to integers first, so
// 0.5-cent boundaries are exact instead of depending on floating-point luck.
// ---------------------------------------------------------------------------

function assertWholeCents(cents: number): void {
  if (!Number.isInteger(cents) || cents < 0) {
    throw new RangeError(`cents must be whole, non-negative cents, got ${cents}`);
  }
}

/** Integer division of non-negative integers, rounding half up. */
function divideHalfUp(numerator: number, denominator: number): number {
  return Math.floor((numerator + denominator / 2) / denominator);
}

/**
 * `percent` % of `cents`, rounded half up. Percent may have up to two decimals (25.5, 12.75).
 * 10730 at 25.5 % = 2736.15 → 2736.
 */
export function percentOfCents(cents: number, percent: number): number {
  assertWholeCents(cents);
  const basisPoints = Math.round(percent * 100);
  return divideHalfUp(cents * basisPoints, 10_000);
}

const FACTOR_SCALE = 1_000_000_000_000n; // 12 decimals

/**
 * `cents` × `factor`, rounded once, half up. 389000 × 0.027584 = 10730.176 → 10730.
 *
 * The factor is scaled to an integer with 12 decimals and multiplied in BigInt, so no product
 * can overflow. That is exact for the coefficient table's six decimals and for factors such as
 * 0.2405 (so half cents are exact), and for any other factor (an interpolated age curve times
 * condition times usage) the scaling is off by under 0.00002 cent even on 260,000 €, so the
 * one rounding to a cent is the only one that matters.
 */
export function multiplyCents(cents: number, factor: number): number {
  assertWholeCents(cents);
  if (!Number.isFinite(factor) || factor < 0) {
    throw new RangeError(`factor must be a finite, non-negative number, got ${factor}`);
  }
  const scaled = BigInt(Math.round(factor * 1e12));
  return Number((BigInt(cents) * scaled * 2n + FACTOR_SCALE) / (2n * FACTOR_SCALE));
}
