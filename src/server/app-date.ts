// The app's "today" for the current request: the time-travel date from the viewer's cookie if
// they set one, otherwise the real date in Helsinki. Pages and API routes call this once and
// pass the date on; domain code never reads the clock.
import { cookies } from 'next/headers';
import { resolveAppDate, SIMULATED_DATE_COOKIE, todayIso, type AppDate } from './today';

export async function appDate(): Promise<AppDate> {
  const store = await cookies();
  return resolveAppDate(store.get(SIMULATED_DATE_COOKIE)?.value, todayIso());
}
