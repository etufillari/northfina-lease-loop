// "Today" for the app, as an ISO date. Domain code never reads the clock itself:
// pages and routes call this once and pass the result in.

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

/** Cookie that holds the time-travel date. It lives in one browser, so it only moves that viewer's clock. */
export const SIMULATED_DATE_COOKIE = 'lease-loop-date';

export type AppDate = {
  /** The date the app works with: the time-travel date if one is set, otherwise the real one. */
  today: string;
  realToday: string;
  simulated: boolean;
};

/**
 * Picks the app's date: a valid `YYYY-MM-DD` time-travel value between 2000 and 2099 wins,
 * anything else (missing, malformed, 31 February) falls back to the real date.
 */
export function resolveAppDate(simulatedValue: string | undefined, realToday: string): AppDate {
  const real: AppDate = { today: realToday, realToday, simulated: false };
  const match = /^(20\d{2})-(\d{2})-(\d{2})$/.exec(simulatedValue ?? '');
  if (!match) return real;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(year, month - 1, day));
  const valid = date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
  if (!valid) return real;
  return { today: simulatedValue as string, realToday, simulated: simulatedValue !== realToday };
}
