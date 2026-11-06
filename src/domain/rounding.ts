// The one place money is rounded. Policy (docs/DECISIONS.md): round half-up, once per
// derived amount; schedules make the last invoice absorb leftover cents so sums stay exact.

/**
 * `numerator / denominator` rounded half-up, in pure integer arithmetic (no floats, so no
 * 0.1 + 0.2 surprises). Both arguments must be integers, `numerator >= 0`, `denominator > 0`.
 */
export function divideHalfUp(numerator: number, denominator: number): number {
  if (!Number.isInteger(numerator) || !Number.isInteger(denominator)) {
    throw new RangeError(`divideHalfUp needs integers, got ${numerator} / ${denominator}`);
  }
  if (numerator < 0 || denominator <= 0) {
    throw new RangeError(`divideHalfUp needs numerator >= 0 and denominator > 0`);
  }
  const quotient = Math.floor(numerator / denominator);
  const remainder = numerator - quotient * denominator;
  return remainder * 2 >= denominator ? quotient + 1 : quotient;
}
