// Finnish business ID (y-tunnus) check digit: seven digits, a dash, one check digit.
// Official weights 7 9 10 5 8 4 2; sum mod 11: 0 → check digit 0, 1 → no valid check digit
// exists (no such ID is ever issued), otherwise 11 − remainder. Every business in the data
// pack validates except cust-broken-id's 1234567-8 (the correct digit would be 1).

const FORMAT = /^(\d{7})-(\d)$/;
const WEIGHTS = [7, 9, 10, 5, 8, 4, 2] as const;

export type BusinessIdResult =
  { ok: true } | { ok: false; reason: 'bad_format' | 'wrong_check_digit' | 'no_valid_check_digit' };

export function validateFinnishBusinessId(businessId: string): BusinessIdResult {
  const match = FORMAT.exec(businessId.trim());
  if (!match) return { ok: false, reason: 'bad_format' };
  const digits = match[1]!;
  const given = Number(match[2]!);

  let sum = 0;
  for (let i = 0; i < 7; i++) sum += Number(digits[i]!) * WEIGHTS[i]!;
  const remainder = sum % 11;

  if (remainder === 1) return { ok: false, reason: 'no_valid_check_digit' };
  const expected = remainder === 0 ? 0 : 11 - remainder;
  return given === expected ? { ok: true } : { ok: false, reason: 'wrong_check_digit' };
}

export function isValidFinnishBusinessId(businessId: string): boolean {
  return validateFinnishBusinessId(businessId).ok;
}
