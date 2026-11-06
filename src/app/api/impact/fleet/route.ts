// GET /api/impact/fleet?asOf=YYYY-MM-DD
import { handleRoute, ok } from '@/server/api-response';
import {
  circularImpactQuerySchema,
  getFleetCircularImpact,
} from '@/server/second-life/circular-impact';
import { db } from '@/server/db';

export const GET = handleRoute(async (request) => {
  const input = circularImpactQuerySchema.parse({
    asOf: new URL(request.url).searchParams.get('asOf') ?? undefined,
  });
  const result = await getFleetCircularImpact(db, input);
  return ok(result.impact);
});
