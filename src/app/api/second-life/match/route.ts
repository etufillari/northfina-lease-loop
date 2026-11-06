// Preview: which waiting-list requests a returned asset could serve, and the decision.
// Creates nothing; reserving is a separate step (POST /api/second-life/reservations).
import { handleRoute, ok, readJsonBody } from '@/server/api-response';
import { db } from '@/server/db';
import {
  activeReservedRequestIds,
  describeSecondLifeResult,
} from '@/server/second-life-reservations';
import { evaluateSecondLife, secondLifeEvaluationSchema } from '@/server/second-life';

export const POST = handleRoute(async (request) => {
  const body = await readJsonBody(request, secondLifeEvaluationSchema);
  const result = await evaluateSecondLife(db, body, await activeReservedRequestIds(db));
  return ok({
    ...describeSecondLifeResult(result),
    reservationCreated: false,
    contractCreated: false,
  });
});
