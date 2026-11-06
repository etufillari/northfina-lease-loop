// The real calendar date, as an ISO date. Domain code never reads the clock itself. Pages and
// routes should call `currentDate` in ./app-date.ts, which also honours an admin's demo date.

/** The calendar date of `now` in `timeZone` (Helsinki by default), as `YYYY-MM-DD`. */
export function todayIso(now: Date = new Date(), timeZone = 'Europe/Helsinki'): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}
