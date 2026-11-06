// Money helpers. Amounts are always integer euro cents; only format at the edge (the UI).
//
// THE ROUNDING RULE: every amount is rounded once, half up (x.5 goes away from zero), with
// `roundHalfUp`. Rates are first turned into whole numbers (a factor into millionths, a
// percent into basis points), so the calculation itself never touches a binary fraction.
// The largest product here is 25 000 000 cents × 56 022 millionths ≈ 1.4e12, far below
// Number.MAX_SAFE_INTEGER, so plain integers are exact and BigInt is not needed.

const FACTOR_SCALE = 1_000_000;
const BASIS_POINTS_SCALE = 10_000;
/** Allowed gap between a rate and its whole-number form: data noise, not lost precision. */
const REPRESENTATION_TOLERANCE = 1e-6;

/** `numerator / denominator`, rounded half up. Exact, because it works with the remainder. */
export function roundHalfUp(numerator: number, denominator: number): number {
  if (!Number.isSafeInteger(numerator) || numerator < 0) {
    throw new RangeError(`numerator must be a non-negative safe integer, got ${numerator}`);
  }
  if (!Number.isSafeInteger(denominator) || denominator <= 0) {
    throw new RangeError(`denominator must be a positive safe integer, got ${denominator}`);
  }
  const remainder = numerator % denominator;
  const quotient = (numerator - remainder) / denominator;
  return remainder * 2 >= denominator ? quotient + 1 : quotient;
}

function toWholeUnits(rate: number, scale: number, label: string): number {
  const scaled = rate * scale;
  const whole = Math.round(scaled);
  if (rate < 0 || Math.abs(scaled - whole) > REPRESENTATION_TOLERANCE) {
    throw new RangeError(`${label} ${rate} does not fit the expected precision`);
  }
  return whole;
}

/** 0.027584 → 27584. Throws if the factor has more than six decimals. */
export function factorToMicros(factor: number): number {
  return toWholeUnits(factor, FACTOR_SCALE, 'factor');
}

/** 25.5 → 2550. Throws if the percent has more than two decimals. */
export function percentToBasisPoints(percent: number): number {
  return toWholeUnits(percent, 100, 'percent');
}

/** `cents × factor`, rounded half up to whole cents. */
export function applyFactor(cents: number, factor: number): number {
  return roundHalfUp(cents * factorToMicros(factor), FACTOR_SCALE);
}

/** `percent` % of `cents`, rounded half up to whole cents. */
export function percentOf(cents: number, percent: number): number {
  return roundHalfUp(cents * percentToBasisPoints(percent), BASIS_POINTS_SCALE);
}

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
