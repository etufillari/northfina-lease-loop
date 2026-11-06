/** Calendar validation without reading a clock. */
export function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const day = Number(value.slice(8, 10));
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return year >= 1 && month >= 1 && month <= 12 && day >= 1 && day <= (days[month - 1] ?? 0);
}

/** Feb 29 birthdays use Feb 28 in non-leap years for this demo eligibility policy. */
export function ageOnDate(birthDate: string, onDate: string): number | null {
  if (!isCalendarDate(birthDate) || !isCalendarDate(onDate) || birthDate > onDate) return null;
  const year = Number(onDate.slice(0, 4));
  const birthday =
    birthDate.slice(5) === '02-29' && !isCalendarDate(`${year}-02-29`)
      ? '02-28'
      : birthDate.slice(5);
  return year - Number(birthDate.slice(0, 4)) - (onDate.slice(5) < birthday ? 1 : 0);
}

/** Finnish Tax Administration's modulus-11 check; does not verify business registration. */
export function validBusinessId(value: string): boolean {
  if (!/^\d{7}-\d$/.test(value) || value.startsWith('0000000')) return false;
  const weights = [7, 9, 10, 5, 8, 4, 2];
  const remainder =
    weights.reduce((sum, weight, index) => sum + Number(value[index]) * weight, 0) % 11;
  return remainder !== 1 && Number(value[8]) === (remainder === 0 ? 0 : 11 - remainder);
}

/** Parse euros into integer cents exactly. No rounding: reject more than two decimals. */
export function parseEuroCents(value: string): number | null {
  const match = /^(\d+)(?:[.,](\d{0,2}))?$/.exec(value.trim());
  if (!match?.[1] || match[1].length > 13) return null;
  const cents = BigInt(match[1]) * 100n + BigInt((match[2] ?? '').padEnd(2, '0'));
  return cents <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(cents) : null;
}

/**
 * The first date on which someone born on `birthDate` is `age` years old, using the same
 * Feb 29 → Feb 28 rule as `ageOnDate`, so `ageOnDate(birthDate, dateOfAge(...)) === age`.
 */
export function dateOfAge(birthDate: string, age: number): string | null {
  if (!isCalendarDate(birthDate) || !Number.isInteger(age) || age < 0) return null;
  const year = String(Number(birthDate.slice(0, 4)) + age).padStart(4, '0');
  const day = `${year}-${birthDate.slice(5)}`;
  return isCalendarDate(day) ? day : `${year}-02-28`;
}
