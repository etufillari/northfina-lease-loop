// The Finnish business ID (Y-tunnus): seven digits, a hyphen and a check digit.
// The public algorithm: multiply the seven digits by 7 9 10 5 8 4 2, sum, take the
// remainder mod 11. Remainder 0 → check digit 0; remainder 1 → no valid id exists;
// otherwise the check digit is 11 − remainder.

const WEIGHTS = [7, 9, 10, 5, 8, 4, 2] as const;

/** The check digit for seven digits, or null when the remainder is 1 (never valid). */
export function businessIdCheckDigit(sevenDigits: string): number | null {
  if (!/^\d{7}$/.test(sevenDigits)) {
    throw new RangeError(`expected seven digits, got "${sevenDigits}"`);
  }
  const sum = WEIGHTS.reduce((acc, weight, i) => acc + weight * Number(sevenDigits.charAt(i)), 0);
  const remainder = sum % 11;
  if (remainder === 0) return 0;
  if (remainder === 1) return null;
  return 11 - remainder;
}

/** `1234567-1` with the right check digit. Surrounding spaces are ignored. */
export function isValidBusinessId(value: string): boolean {
  const match = /^(\d{7})-(\d)$/.exec(value.trim());
  const [, digits, check] = match ?? [];
  if (digits === undefined || check === undefined) return false;
  return businessIdCheckDigit(digits) === Number(check);
}
