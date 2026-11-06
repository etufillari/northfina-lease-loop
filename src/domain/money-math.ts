// Integer euro-cent arithmetic with one rounding rule (decision D1):
// half up to the cent, once, after integer arithmetic. Factors are held in millionths and
// rates in basis points, so every multiplication is exact and only the final division rounds.

const MILLION = 1_000_000;
const BASIS_POINTS_PER_WHOLE = 10_000;

function assertNonNegativeSafeInteger(name: string, value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative safe integer, got ${value}`);
  }
}

/**
 * Divides two non-negative integers and rounds the quotient half up: a remainder of exactly
 * half the denominator or more rounds up (272 037.5 → 272 038), anything below half rounds
 * down (10 730.176 → 10 730, 2 736.15 → 2 736). This is the only rounding step in the money
 * code.
 */
export function roundHalfUpDiv(numerator: number, denominator: number): number {
  assertNonNegativeSafeInteger('numerator', numerator);
  if (!Number.isSafeInteger(denominator) || denominator <= 0) {
    throw new RangeError(`denominator must be a positive safe integer, got ${denominator}`);
  }
  const remainder = numerator % denominator;
  const quotient = (numerator - remainder) / denominator;
  return remainder * 2 >= denominator ? quotient + 1 : quotient;
}

/**
 * The same half-up rule as `roundHalfUpDiv`, on BigInts, for a product of several factors that
 * outgrows a safe integer (the market value: list price × curve × condition × usage). One rule,
 * two number types; nothing else in the money code rounds.
 */
export function roundHalfUpDivBig(numerator: bigint, denominator: bigint): bigint {
  if (numerator < 0n) throw new RangeError(`numerator must be ≥ 0, got ${numerator}`);
  if (denominator <= 0n) throw new RangeError(`denominator must be > 0, got ${denominator}`);
  const quotient = numerator / denominator;
  return (numerator % denominator) * 2n >= denominator ? quotient + 1n : quotient;
}

/**
 * Turns a coefficient such as 0.027584 into integer millionths (27 584). Throws if the factor
 * is negative or has more than six decimals, so the conversion is always exact.
 */
export function factorToMillionths(factor: number): number {
  if (!Number.isFinite(factor) || factor < 0) {
    throw new RangeError(`factor must be a non-negative number, got ${factor}`);
  }
  const millionths = Math.round(factor * MILLION);
  if (!Number.isSafeInteger(millionths) || millionths / MILLION !== factor) {
    throw new RangeError(`factor must have at most six decimals, got ${factor}`);
  }
  return millionths;
}

function safeProduct(a: number, b: number, what: string): number {
  const product = a * b;
  if (!Number.isSafeInteger(product)) {
    throw new RangeError(`${what} exceeds the safe integer range`);
  }
  return product;
}

/** `cents × factorMillionths / 1 000 000`, rounded half up once. */
export function applyMillionths(cents: number, factorMillionths: number): number {
  assertNonNegativeSafeInteger('cents', cents);
  assertNonNegativeSafeInteger('factorMillionths', factorMillionths);
  return roundHalfUpDiv(safeProduct(cents, factorMillionths, 'cents × factorMillionths'), MILLION);
}

/** `cents × rateBasisPoints / 10 000`, rounded half up once (2550 basis points = 25.5 %). */
export function percentOf(cents: number, rateBasisPoints: number): number {
  assertNonNegativeSafeInteger('cents', cents);
  assertNonNegativeSafeInteger('rateBasisPoints', rateBasisPoints);
  return roundHalfUpDiv(
    safeProduct(cents, rateBasisPoints, 'cents × rateBasisPoints'),
    BASIS_POINTS_PER_WHOLE
  );
}

export type VatSplit = { netCents: number; vatCents: number; grossCents: number };

/**
 * VAT on one line: the VAT is rounded from the net (D1, per line) and the gross is net + VAT.
 * The VAT is never recomputed from the gross.
 */
export function splitVat(netCents: number, rateBasisPoints: number): VatSplit {
  const vatCents = percentOf(netCents, rateBasisPoints);
  return { netCents, vatCents, grossCents: netCents + vatCents };
}

/** Turns a percent such as 25.5 into basis points (2550). Throws on more than two decimals. */
export function percentToBasisPoints(percent: number): number {
  if (!Number.isFinite(percent) || percent < 0) {
    throw new RangeError(`percent must be a non-negative number, got ${percent}`);
  }
  const basisPoints = Math.round(percent * 100);
  if (basisPoints / 100 !== percent) {
    throw new RangeError(`percent must have at most two decimals, got ${percent}`);
  }
  return basisPoints;
}
