// "Today" for a request: an explicit ?asOf=YYYY-MM-DD wins, then the time-travel cookie set
// by the nav-bar control, then the real date. Time travel keeps every judged scenario
// replayable on demo day — the cards live on specific dates.
import { cookies } from 'next/headers';
import { AS_OF_COOKIE } from '@/components/as-of-cookie';
import { todayIso } from '@/server/today';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const valid = (value: string | null | undefined) => (value && ISO_DATE.test(value) ? value : null);

/** For API route handlers (reads the cookie from the request headers). */
export function asOfFrom(request: Request): string {
  const param = valid(new URL(request.url).searchParams.get('asOf'));
  if (param) return param;
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
  const raw = searchParams.asOf;
  const asOfParam = valid(typeof raw === 'string' ? raw : null);
  if (asOfParam) return { asOf: asOfParam, asOfParam };
  const cookie = valid((await cookies()).get(AS_OF_COOKIE)?.value);
  return { asOf: cookie ?? todayIso(), asOfParam: null };
}
