/** Decimal data is converted to an exact rational before it touches cents. */
export function decimalRatio(value: number): readonly [bigint, bigint] {
  if (!Number.isFinite(value) || value < 0) throw new RangeError('Invalid nonnegative decimal');
  const [mantissa = '', exponent = '0'] = String(value).split('e');
  const [whole = '', fraction = ''] = mantissa.split('.');
  const scale = fraction.length - Number(exponent);
  if (Math.abs(scale) > 100) throw new RangeError('Unsupported decimal precision');
  return scale >= 0
    ? [BigInt(whole + fraction), 10n ** BigInt(scale)]
    : [BigInt(whole + fraction) * 10n ** BigInt(-scale), 1n];
}

/** Nonnegative half-up, once at the final cent. */
export function roundRatio(numerator: bigint, denominator: bigint): number {
  if (numerator < 0n || denominator <= 0n) throw new RangeError('Invalid rounding ratio');
  const result = (2n * numerator + denominator) / (2n * denominator);
  if (result > BigInt(Number.MAX_SAFE_INTEGER)) throw new RangeError('Amount overflow');
  return Number(result);
}

export function multiplyCents(cents: number, factor: number): number {
  if (!Number.isSafeInteger(cents) || cents < 0) throw new RangeError('Invalid cents');
  const [n, d] = decimalRatio(factor);
  return roundRatio(BigInt(cents) * n, d);
}

/** Contractual net cost if the optional buyout is chosen; future VAT is separate. */
export function totalNetIfBought(
  monthlyNetCents: number,
  termMonths: number,
  downPaymentCents: number,
  buyoutNetCents: number
): number {
  if (
    ![monthlyNetCents, termMonths, downPaymentCents, buyoutNetCents].every(
      (n) => Number.isSafeInteger(n) && n >= 0
    )
  )
    throw new RangeError('Invalid contractual amounts');
  return roundRatio(
    BigInt(monthlyNetCents) * BigInt(termMonths) +
      BigInt(downPaymentCents) +
      BigInt(buyoutNetCents),
    1n
  );
}
