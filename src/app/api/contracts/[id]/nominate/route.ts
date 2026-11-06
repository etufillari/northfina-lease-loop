// POST /api/contracts/:id/nominate  body: { email, actor }
// End-of-term "pass it on": the named person may apply for a new lease on this item and
// skips the waiting list — explicitly, on the record.
import { z } from 'zod';
import { fail, handleRoute, ok, readJsonBody } from '@/server/api-response';
import { asOfFrom } from '@/server/as-of';
import { db } from '@/server/db';
import { nominateSuccessor } from '@/server/lifecycle';

const bodySchema = z.strictObject({
  email: z.email(),
  actor: z.string().trim().min(1).max(100),
});

export const POST = handleRoute(
  async (request, { params }: RouteContext<'/api/contracts/[id]/nominate'>) => {
    const { id } = await params;
    const body = await readJsonBody(request, bodySchema);
    const result = await nominateSuccessor(db, {
      contractId: id,
      email: body.email,
      actor: body.actor,
      asOf: asOfFrom(request),
    });
    if (!result.ok) {
      const failures: Record<typeof result.reason, [number, string, string]> = {
        not_found: [404, 'CONTRACT_NOT_FOUND', 'No such contract'],
        not_yours: [403, 'NOT_YOURS', 'This belongs to another customer'],
        bad_status: [409, 'BAD_STATUS', 'Nomination is for active or returned leases'],
        buying: [409, 'BUYING', 'You chose to buy this item at the end of the term'],
        unknown_nominee: [
          404,
          'UNKNOWN_NOMINEE',
          'Nobody with this email has an account yet; ask them to sign up first',
        ],
        self_nomination: [409, 'SELF_NOMINATION', 'You cannot nominate yourself'],
      };
      const [status, code, message] = failures[result.reason];
      return fail(status, code, message);
    }
    return ok(result);
  }
);
