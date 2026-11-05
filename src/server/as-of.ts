// The single source of "today" for pages and routes (D-030): the demo date from a cookie when it
// is valid, otherwise the real date in Helsinki. Never call `todayIso()` from a page or route.
import { cookies } from 'next/headers';
import { effectiveToday, type EffectiveToday } from '@/domain/as-of';
import { todayIso } from './today';

export const AS_OF_COOKIE = 'lease-loop-as-of';

/** A session cookie: closing the browser goes back to the real date. */
export const asOfCookieOptions = {
  httpOnly: true,
  sameSite: 'lax',
  path: '/',
} as const;

/** The part of Next's cookie store this helper reads; tests pass a plain object. */
export type CookieReader = { get(name: string): { value: string } | undefined };

/** The effective date, the real date and whether they differ (for the banner). */
export async function asOf(store?: CookieReader, now: Date = new Date()): Promise<EffectiveToday> {
  const reader = store ?? (await cookies());
  return effectiveToday(reader.get(AS_OF_COOKIE)?.value, todayIso(now));
}

/** The date to use as today, as `YYYY-MM-DD`. */
export async function asOfDate(store?: CookieReader, now?: Date): Promise<string> {
  return (await asOf(store, now)).date;
}
