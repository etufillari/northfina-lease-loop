// The demo clock: lets the demo page (and the judges) travel to any day, so a scenario card
// dated September 2026 or February 2028 runs on its own date. `todayIso()` stays the only
// real clock; the override is a cookie set by POST /api/demo/clock (cookies are read-only
// while a server component renders). Pages and routes call `todayForRequest()` once and
// pass the day down; the domain never sees a clock.
import { cookies } from 'next/headers';
import { todayIso } from './today';

export const DEMO_CLOCK_COOKIE = 'lease-loop-as-of';

/**
 * `Set-Cookie` value that moves the demo clock to `asOf`, or back to the real day with null.
 * For the routes that set the clock (the clock form and the scenario card runner).
 */
export function demoClockCookieHeader(asOf: string | null): string {
  return asOf === null
    ? `${DEMO_CLOCK_COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax`
    : `${DEMO_CLOCK_COOKIE}=${asOf}; Path=/; HttpOnly; SameSite=Lax`;
}

/** True for a real calendar day written `YYYY-MM-DD` (so `2026-02-29` is false). */
export function isIsoDay(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  if (month < 1 || month > 12 || day < 1) return false;
  // Day 0 of the next month is the last day of this one.
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return day <= daysInMonth;
}

/** The day the app should treat as today: a valid override wins, anything else is ignored. */
export function resolveToday(systemToday: string, override: string | undefined): string {
  return override !== undefined && isIsoDay(override) ? override : systemToday;
}

export type DemoClock = {
  /** The day the app runs on for this request. */
  today: string;
  /** The real day, from the system clock. */
  systemToday: string;
  /** True when the demo clock moved the day (a valid cookie is set). */
  overridden: boolean;
};

/** The demo clock for this request, for the demo page that shows whether it is moved. */
export async function readDemoClock(): Promise<DemoClock> {
  const store = await cookies();
  const systemToday = todayIso();
  const today = resolveToday(systemToday, store.get(DEMO_CLOCK_COOKIE)?.value);
  return { today, systemToday, overridden: today !== systemToday };
}

/** Today for this request: the demo clock cookie if it holds a valid day, else the real day. */
export async function todayForRequest(): Promise<string> {
  return (await readDemoClock()).today;
}
