// GET /api/dealer/forecast[?from=YYYY-MM-DD&to=YYYY-MM-DD]
// Active leases ending in the range (default: next calendar month), soonest first, with a
// summary. The dates are an expectation of when items come back, not a confirmed return.
import { handleRoute, ok } from '@/server/api-response';
import { db } from '@/server/db';
import { getLeaseForecast } from '@/server/lease-forecast';
import { todayIso } from '@/server/today';

export const GET = handleRoute(async (request) => {
  const { searchParams } = new URL(request.url);

  return ok(
    await getLeaseForecast(db, {
      today: todayIso(),
      from: searchParams.get('from') ?? undefined,
      to: searchParams.get('to') ?? undefined,
    })
  );
});
