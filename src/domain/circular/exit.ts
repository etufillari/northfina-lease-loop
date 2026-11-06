/** Agreed demo policy: capped remaining rent, no admin fee; ordinary end return is free. */
export function earlyReturnNet(
  monthlyNetCents: number,
  termMonths: number,
  elapsedMonths: number,
  buyoutNetCents: number
) {
  if (
    ![monthlyNetCents, termMonths, elapsedMonths, buyoutNetCents].every(Number.isSafeInteger) ||
    monthlyNetCents < 0 ||
    buyoutNetCents < 0 ||
    termMonths < 1 ||
    elapsedMonths < 0 ||
    elapsedMonths > termMonths
  )
    throw new RangeError('Invalid exit inputs');
  const remainingRentNetCents = monthlyNetCents * (termMonths - elapsedMonths);
  if (!Number.isSafeInteger(remainingRentNetCents)) throw new RangeError('Exit overflow');
  return {
    remainingRentNetCents,
    buyoutCapNetCents: buyoutNetCents,
    feeNetCents: Math.min(remainingRentNetCents, buyoutNetCents),
    policy: 'EXIT_CAP_BUYOUT_V1' as const,
  };
}
