// "Today" for a request: the real date, or an ?asOf=YYYY-MM-DD override — the override is
// the time-travel mode, and it keeps every judged scenario replayable on demo day.
import { todayIso } from '@/server/today';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function asOfFrom(request: Request): string {
  const value = new URL(request.url).searchParams.get('asOf');
  return value && ISO_DATE.test(value) ? value : todayIso();
}
