// "Today" for a request. In demo mode an explicit ?asOf=YYYY-MM-DD wins, then the SHARED
// demo clock (one per database, moved by the time-travel bar), then the browser's old
// cookie, then the real date. The shared clock keeps every browser on the same demo day: a
// hand-over signed in a second window happens on the day the giver sees. With DEMO_MODE=off
// it is always the real date: an override would let anyone backdate quotes, holds and age
// checks (src/server/demo-mode.ts).
import { cookies } from 'next/headers';
import { AS_OF_COOKIE } from '@/components/as-of-cookie';
import { demoMode } from '@/server/demo-mode';
import { todayIso } from '@/server/today';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const valid = (value: string | null | undefined) => (value && ISO_DATE.test(value) ? value : null);

// Imported lazily so tests of pure helpers can load this module without a database.
async function sharedClock(): Promise<string | null> {
  try {
    const [{ db }, { getDemoClock }] = await Promise.all([
      import('@/server/db'),
      import('@/server/demo-clock'),
    ]);
    return await getDemoClock(db);
  } catch {
    // No database here (a pure test), or a database from before the clock existed.
    return null;
  }
}

/** For API route handlers (reads the cookie from the request headers). */
export async function asOfFrom(request: Request): Promise<string> {
  if (!demoMode()) return todayIso();
  const param = valid(new URL(request.url).searchParams.get('asOf'));
  if (param) return param;
  const clock = await sharedClock();
  if (clock) return clock;
  const cookie = request.headers
    .get('cookie')
    ?.split(/;\s*/)
    .find((part) => part.startsWith(`${AS_OF_COOKIE}=`))
    ?.slice(AS_OF_COOKIE.length + 1);
  return valid(cookie ? decodeURIComponent(cookie) : null) ?? todayIso();
}

/** For server pages: the resolved as-of date, and the raw ?asOf= for building links. */
export async function asOfFromPage(
  searchParams: Record<string, string | string[] | undefined>
): Promise<{ asOf: string; asOfParam: string | null }> {
  if (!demoMode()) return { asOf: todayIso(), asOfParam: null };
  const raw = searchParams.asOf;
  const asOfParam = valid(typeof raw === 'string' ? raw : null);
  if (asOfParam) return { asOf: asOfParam, asOfParam };
  const clock = await sharedClock();
  if (clock) return { asOf: clock, asOfParam: null };
  const cookie = valid((await cookies()).get(AS_OF_COOKIE)?.value);
  return { asOf: cookie ?? todayIso(), asOfParam: null };
}
