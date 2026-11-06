// Reserve a returned asset for the winner of the second-life decision.
import { handleRoute, ok, readJsonBody } from '@/server/api-response';
import { db } from '@/server/db';
import { reserveSecondLife, reserveSecondLifeSchema } from '@/server/second-life-reservations';

export const POST = handleRoute(async (request) => {
  const body = await readJsonBody(request, reserveSecondLifeSchema);
  const reservation = await reserveSecondLife(db, body);
  return ok({ reservation }, { status: 201 });
});
