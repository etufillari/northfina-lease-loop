// POST /api/demo/clock   body: { "asOf": "2026-09-15" } to travel, { "asOf": null } to go back.
// Sets or clears the demo clock cookie; every page and route reads it once per request
// through todayForRequest(). The only endpoint that accepts a date from the browser.
import { handleRoute, ok, readJsonBody } from '@/server/api-response';
import { demoClockCookieHeader } from '@/server/demo-clock';
import { demoClockBodySchema } from '@/server/routes';
import { todayIso } from '@/server/today';

export const POST = handleRoute(async (request) => {
  const { asOf } = await readJsonBody(request, demoClockBodySchema);
  const headers = { 'Set-Cookie': demoClockCookieHeader(asOf) };
  return ok({ asOf, today: asOf ?? todayIso() }, { headers });
});
