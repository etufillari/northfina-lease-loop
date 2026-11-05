// Finnish business ID (Y-tunnus): seven digits, a hyphen and one check digit, e.g. `3012456-5`.

const FORMAT = /^(\d{7})-(\d)$/;
const WEIGHTS = [7, 9, 10, 5, 8, 4, 2] as const;

/**
 * Is `value` a well-formed Y-tunnus with the right check digit?
 *
 * The first seven digits are multiplied by 7, 9, 10, 5, 8, 4, 2 and summed. With r = sum mod 11:
 * r = 0 gives check digit 0, r = 1 means the number can never be valid, and any other r gives
 * 11 - r. Surrounding whitespace is ignored; anything else that does not match the format is
 * invalid (a normal answer, not an error).
 */
export function isValidBusinessId(value: string): boolean {
  const match = FORMAT.exec(value.trim());
  if (!match) return false;

  const digits = match[1]!;
  const checkDigit = Number(match[2]);
  const sum = WEIGHTS.reduce((acc, weight, i) => acc + weight * Number(digits[i]), 0);
  const remainder = sum % 11;

  if (remainder === 1) return false;
  return checkDigit === (remainder === 0 ? 0 : 11 - remainder);
}
