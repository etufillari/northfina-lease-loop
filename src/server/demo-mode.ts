// Demo mode lets a presenter pick "today" and act as a data-pack persona (scenario cards).
// On by default in development and tests; in production only with LEASE_LOOP_DEMO=true.
import { cookies } from 'next/headers';
import { effectiveToday } from '@/domain/demo';
import { ApiError } from './api-response';
import { todayIso } from './today';

export const DEMO_DATE_COOKIE = 'lease-loop.demo-date';

export function demoModeEnabled(env: Record<string, string | undefined> = process.env): boolean {
  if (env.LEASE_LOOP_DEMO === 'true') return true;
  if (env.LEASE_LOOP_DEMO === 'false') return false;
  return env.NODE_ENV !== 'production';
}

export function requireDemoMode() {
  // Look like any unknown route when demo mode is off.
  if (!demoModeEnabled()) throw new ApiError(404, 'NOT_FOUND', 'Not found.');
}

/** The value of one cookie in a `Cookie` request header, or undefined. */
export function cookieFrom(header: string | null, name: string): string | undefined {
  for (const part of header?.split(';') ?? []) {
    const separator = part.indexOf('=');
    if (separator > 0 && part.slice(0, separator).trim() === name)
      return part.slice(separator + 1).trim();
  }
  return undefined;
}

/** The app's today for an API route: reads the demo date from the request's own cookies. */
export function requestToday(request: Request, now: Date = new Date()): string {
  const realToday = todayIso(now);
  if (!demoModeEnabled()) return realToday;
  return effectiveToday(
    cookieFrom(request.headers.get('cookie'), DEMO_DATE_COOKIE),
    true,
    realToday
  );
}

/**
 * The app's today for pages and server components (API routes use `requestToday`). Pages
 * call this once and pass the result to domain code; outside demo mode, or without a valid
 * demo date, it is the real Helsinki date.
 */
export async function appToday(now: Date = new Date()): Promise<string> {
  const realToday = todayIso(now);
  if (!demoModeEnabled()) return realToday;
  const store = await cookies();
  return effectiveToday(store.get(DEMO_DATE_COOKIE)?.value, true, realToday);
}
