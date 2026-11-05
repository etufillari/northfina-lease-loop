// Finnish business ID (Y-tunnus): seven digits, a hyphen and a check digit.
// Check digit: weights 7 9 10 5 8 4 2 on the seven digits, r = sum mod 11. r = 0 → 0;
// r = 1 → no valid ID is ever issued; otherwise 11 − r.

const FORMAT = /^(\d{7})-(\d)$/;
const WEIGHTS = [7, 9, 10, 5, 8, 4, 2];

export function isValidBusinessId(id: string): boolean {
  const match = FORMAT.exec(id);
  if (!match?.[1] || !match[2]) return false;
  const digits = [...match[1]].map(Number);
  const remainder = digits.reduce((sum, digit, i) => sum + digit * (WEIGHTS[i] ?? 0), 0) % 11;
  if (remainder === 1) return false;
  const expected = remainder === 0 ? 0 : 11 - remainder;
  return Number(match[2]) === expected;
}
