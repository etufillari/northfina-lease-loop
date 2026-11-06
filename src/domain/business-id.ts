// Check digit only, not a registry lookup or proof of signatory authority.
// Source: Finnish Tax Administration, VH/6207/00.01.00/2022, section 1.1.
export function isFinnishBusinessId(value: string): boolean {
  if (value.length !== 9 || !/^\d{7}-\d$/.test(value)) return false;
  const weights = [7, 9, 10, 5, 8, 4, 2];
  const sum = weights.reduce((total, weight, index) => total + Number(value[index]) * weight, 0);
  const remainder = sum % 11;
  if (remainder === 1) return false;
  const checkDigit = remainder === 0 ? 0 : 11 - remainder;
  return checkDigit === Number(value[8]);
}
