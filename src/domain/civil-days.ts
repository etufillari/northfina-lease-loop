// Calendar-day arithmetic on ISO day strings, with no clock and no time zone: the day is turned
// into a count of days since 1970-01-01, moved, and turned back (Howard Hinnant's civil-day
// algorithm, exact for every Gregorian date). The one `addDays` of the domain: pricing (the
// quote's validity, D7) and invoicing (the periods, D3/D4) both import it; no `Date` anywhere.

const ISO_DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

function daysFromCivil(year: number, month: number, day: number): number {
  const y = month <= 2 ? year - 1 : year;
  const era = Math.floor(y / 400);
  const yearOfEra = y - era * 400;
  const dayOfYear = Math.floor((153 * (month + (month > 2 ? -3 : 9)) + 2) / 5) + day - 1;
  const dayOfEra =
    yearOfEra * 365 + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100) + dayOfYear;
  return era * 146_097 + dayOfEra - 719_468;
}

function civilFromDays(days: number): [number, number, number] {
  const z = days + 719_468;
  const era = Math.floor(z / 146_097);
  const dayOfEra = z - era * 146_097;
  const yearOfEra = Math.floor(
    (dayOfEra -
      Math.floor(dayOfEra / 1460) +
      Math.floor(dayOfEra / 36_524) -
      Math.floor(dayOfEra / 146_096)) /
      365
  );
  const dayOfYear =
    dayOfEra - (365 * yearOfEra + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100));
  const mp = Math.floor((5 * dayOfYear + 2) / 153);
  const day = dayOfYear - Math.floor((153 * mp + 2) / 5) + 1;
  const month = mp < 10 ? mp + 3 : mp - 9;
  return [yearOfEra + era * 400 + (month <= 2 ? 1 : 0), month, day];
}

const pad = (n: number, width: number) => String(n).padStart(width, '0');

/** `isoDay` moved by `days` calendar days (negative moves back). Throws on a malformed day. */
export function addDays(isoDay: string, days: number): string {
  const match = ISO_DAY.exec(isoDay);
  if (!match || !Number.isSafeInteger(days)) {
    throw new RangeError(`addDays needs a YYYY-MM-DD day and whole days, got ${isoDay}, ${days}`);
  }
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const serial = daysFromCivil(year, month, day);
  // A day that does not exist (2026-02-30, month 13) comes back as a different day: reject it.
  const [y0, m0, d0] = civilFromDays(serial);
  if (y0 !== year || m0 !== month || d0 !== day) {
    throw new RangeError(`addDays got a day that does not exist: ${isoDay}`);
  }
  const [y, m, d] = civilFromDays(serial + days);
  return `${pad(y, 4)}-${pad(m, 2)}-${pad(d, 2)}`;
}
