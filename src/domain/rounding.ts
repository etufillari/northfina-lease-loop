// The one rounding rule for money (ARCHITECTURE.md §6.1).
//
// Every amount is an integer number of euro cents, and every rate is an integer too:
// VAT and interest in basis points (25.5 % → 2550), coefficient factors in parts per
// million (0.027584 → 27584), the buyout as a whole percent (15). A derived amount is
// `amount × rate / scale`, computed in integer arithmetic and rounded **half up** once,
// by `mulDivRound`. Amounts are never negative, so half up and half away from zero agree.
//
// Products stay below 2^53: the largest is 25 000 000 cents × 1 000 000 ppm = 2.5e13.

function assertNonNegativeInteger(name: string, value: number): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative integer, got ${value}`);
  }
}

/**
 * Computes `a × num / den`, rounded half up to an integer, without floating-point error.
 * Throws `RangeError` on non-integer or negative input, a non-positive denominator, or a
 * product too large to hold exactly.
 *
 *   mulDivRound(389_000, 27_584, 1_000_000) → 10 730   (10 730.176)
 *   mulDivRound(10_730, 2_550, 10_000)      →  2 736   ( 2 736.15)
 */
export function mulDivRound(a: number, num: number, den: number): number {
  assertNonNegativeInteger('a', a);
  assertNonNegativeInteger('num', num);
  if (!Number.isInteger(den) || den <= 0) {
    throw new RangeError(`den must be a positive integer, got ${den}`);
  }
  const product = a * num;
  if (!Number.isSafeInteger(product)) {
    throw new RangeError(`${a} × ${num} is too large to compute exactly`);
  }
  const quotient = Math.floor(product / den);
  const remainder = product - quotient * den;
  return remainder * 2 >= den ? quotient + 1 : quotient;
}

/**
 * Splits `total` cents into `parts` integer amounts that differ by at most 1 cent and
 * always sum to `total`. Leftover cents go to the earliest parts.
 *
 *   allocate(100, 3) → [34, 33, 33]
 */
export function allocate(total: number, parts: number): number[] {
  assertNonNegativeInteger('total', total);
  if (!Number.isInteger(parts) || parts < 1) {
    throw new RangeError(`parts must be a positive integer, got ${parts}`);
  }
  const base = Math.floor(total / parts);
  const leftover = total - base * parts;
  return Array.from({ length: parts }, (_, i) => (i < leftover ? base + 1 : base));
}

// --- Rates: data-pack decimals → integers, converted once at the data edge ---------

const EPSILON = 1e-9;

function toExactInt(scaled: number, original: number, unit: string): number {
  const rounded = Math.round(scaled);
  if (!Number.isFinite(scaled) || Math.abs(scaled - rounded) > EPSILON) {
    throw new RangeError(`${original} cannot be stored exactly as ${unit}`);
  }
  // Math.round(-0.0001) is -0; return a plain 0.
  return rounded === 0 ? 0 : rounded;
}

/** 25.5 (%) → 2550 basis points. Throws if precision would be lost. */
export const percentToBp = (percent: number) => toExactInt(percent * 100, percent, 'basis points');

/** 0.95 (a share or multiplier) → 9500 basis points. Throws if precision would be lost. */
export const fractionToBp = (fraction: number) =>
  toExactInt(fraction * 10_000, fraction, 'basis points');

/** 0.027584 → 27584 parts per million. Throws if precision would be lost. */
export const fractionToPpm = (fraction: number) =>
  toExactInt(fraction * 1_000_000, fraction, 'parts per million');

/** 165 → 165; 165.5 throws. */
export const toWholeNumber = (value: number) => toExactInt(value, value, 'a whole number');
