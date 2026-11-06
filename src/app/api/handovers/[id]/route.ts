// POST /api/handovers/:id   body: { "accept": true }
// The recipient of a passed-on item accepts or declines it. Only the customer it was passed
// on to (chosen in "Acting as") can answer. See src/server/end-of-term.ts.
import { z } from 'zod';
import { appDate } from '@/server/app-date';
import { fail, handleRoute, ok, readJsonBody } from '@/server/api-response';
import { currentViewer } from '@/server/current-viewer';
import { db } from '@/server/db';
import { respondToHandover } from '@/server/end-of-term';

const bodySchema = z.strictObject({ accept: z.boolean() });

const failures = {
  not_found: [404, 'NOT_FOUND', 'Handover not found'],
  not_yours: [403, 'NOT_YOURS', 'This item was passed on to another customer'],
  already_decided: [409, 'ALREADY_DECIDED', 'This has already been answered'],
  not_yet: [409, 'NOT_YET', 'This item has not been passed on yet on the app’s date'],
} as const;

export const POST = handleRoute(
  async (request, { params }: RouteContext<'/api/handovers/[id]'>) => {
    const { id } = await params;
    const body = await readJsonBody(request, bodySchema);
    const viewer = await currentViewer();
    const result = await respondToHandover(
      db,
      {
        handoverId: id,
        accept: body.accept,
        customerId: viewer.kind === 'customer' ? viewer.customer.id : null,
        actor: viewer.kind === 'customer' ? viewer.customer.name : 'unknown',
      },
      (await appDate()).today
    );
    if (!result.ok) {
      const [status, code, message] = failures[result.reason];
      return fail(status, code, message);
    }
    return ok(result);
  }
);
