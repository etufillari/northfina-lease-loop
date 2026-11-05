// POST   /api/as-of   body: { date: "YYYY-MM-DD" }   sets the demo date (D-030)
// DELETE /api/as-of                                 back to the real date
// The date lives in a cookie for this browser only. It changes no business data, so there is
// no audit row here; the rows written while it is set record it as `asOf`.
import { cookies } from 'next/headers';
import { z } from 'zod';
import { AS_OF_MAX, AS_OF_MIN, parseAsOfDate } from '@/domain/as-of';
import { fail, handleRoute, ok, readJsonBody } from '@/server/api-response';
import { AS_OF_COOKIE, asOf, asOfCookieOptions } from '@/server/as-of';

const bodySchema = z.strictObject({ date: z.string().max(20) });

export const POST = handleRoute(async (request) => {
  const body = await readJsonBody(request, bodySchema);
  const parsed = parseAsOfDate(body.date);
  if (!parsed.ok) {
    return fail(
      400,
      'INVALID_AS_OF_DATE',
      `The date must be a real date written as YYYY-MM-DD, from ${AS_OF_MIN} to ${AS_OF_MAX}`,
      { reason: parsed.reason, min: AS_OF_MIN, max: AS_OF_MAX }
    );
  }
  const store = await cookies();
  store.set(AS_OF_COOKIE, parsed.date, asOfCookieOptions);
  return ok(await asOf({ get: () => ({ value: parsed.date }) }));
});

export const DELETE = handleRoute(async () => {
  const store = await cookies();
  store.delete({ name: AS_OF_COOKIE, path: asOfCookieOptions.path });
  return ok(await asOf({ get: () => undefined }));
});
