// Finnish business ID (Y-tunnus): seven digits, a hyphen and a check digit, e.g. 3012456-5.

const FORMAT = /^\d{7}-\d$/;
const WEIGHTS = [7, 9, 10, 5, 8, 4, 2];
const MODULUS = 11;

/**
 * Multiply the seven digits by the weights, add them up and take the remainder from 11.
 * Remainder 0 means check digit 0, and any other remainder means 11 minus it. Remainder 1
 * would need the check digit 10, so no valid ID has those seven digits.
 */
export function isValidBusinessId(value: string): boolean {
  if (!FORMAT.test(value)) return false;

  const digits = [...value.slice(0, 7)].map(Number);
  const sum = digits.reduce((total, digit, i) => total + digit * (WEIGHTS[i] ?? 0), 0);
  const remainder = sum % MODULUS;
  if (remainder === 1) return false;

  const checkDigit = remainder === 0 ? 0 : MODULUS - remainder;
  return Number(value.slice(8)) === checkDigit;
}
