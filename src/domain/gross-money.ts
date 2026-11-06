/** Recover the net amount from a VAT-inclusive quote; round once, half up, to whole cents. */
export function netFromGross(grossCents: number, vatBasisPoints: number): number {
  if (![grossCents, vatBasisPoints].every((value) => Number.isSafeInteger(value) && value >= 0))
    throw new RangeError('Invalid gross quote');
  const denominator = 10000n + BigInt(vatBasisPoints);
  return Number((BigInt(grossCents) * 10000n + denominator / 2n) / denominator);
}
