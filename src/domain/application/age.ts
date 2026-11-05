// Ages from ISO dates, compared as text so that time zones cannot shift a birthday.
// Someone born on 29 February has their birthday on 1 March in other years. Countries differ
// (some use 28 February), so this takes the later date: an age limit is then never passed early.

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const LEAP_DAY = '02-29';
const DAY_AFTER_LEAP_DAY = '03-01';

function parts(isoDate: string): { year: number; monthDay: string } {
  if (!ISO_DATE.test(isoDate)) {
    throw new RangeError(`date must look like YYYY-MM-DD, got "${isoDate}"`);
  }
  return { year: Number(isoDate.slice(0, 4)), monthDay: isoDate.slice(5) };
}

function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function birthdayIn(year: number, birthMonthDay: string): string {
  return birthMonthDay === LEAP_DAY && !isLeapYear(year) ? DAY_AFTER_LEAP_DAY : birthMonthDay;
}

/** Age in whole years on `onDate`. Turning a year older happens on the birthday itself. */
export function ageOn(birthDate: string, onDate: string): number {
  const birth = parts(birthDate);
  const on = parts(onDate);
  const hadBirthday = on.monthDay >= birthdayIn(on.year, birth.monthDay);
  return on.year - birth.year - (hadBirthday ? 0 : 1);
}

/** The first date on which someone born on `birthDate` is `age` years old. */
export function eligibleFrom(birthDate: string, age: number): string {
  const birth = parts(birthDate);
  const year = birth.year + age;
  return `${String(year).padStart(4, '0')}-${birthdayIn(year, birth.monthDay)}`;
}
