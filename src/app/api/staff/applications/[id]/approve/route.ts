// POST /api/staff/applications/:id/approve  body: { actor, note? }
// A person approves a manual review: a fresh 7-day hold from the as-of date, audit-logged.
import { z } from 'zod';
import { fail, handleRoute, ok, readJsonBody } from '@/server/api-response';
import { asOfFrom } from '@/server/as-of';
import { db } from '@/server/db';
import { approveApplication } from '@/server/staff';

const bodySchema = z.strictObject({
  actor: z.string().trim().min(1).max(100),
  note: z.string().trim().max(500).optional(),
});

const failures: Record<string, [number, string, string]> = {
  not_found: [404, 'APPLICATION_NOT_FOUND', 'No such application'],
  not_reviewable: [409, 'NOT_REVIEWABLE', 'Only an application in manual review can be approved'],
};

export const POST = handleRoute(
  async (request, { params }: RouteContext<'/api/staff/applications/[id]/approve'>) => {
    const { id } = await params;
    const body = await readJsonBody(request, bodySchema);
    const result = await approveApplication(db, {
      applicationId: id,
      actor: body.actor,
      note: body.note,
      asOf: asOfFrom(request),
    });
    if (!result.ok) {
      const [status, code, message] = failures[result.reason]!;
      return fail(status, code, message);
    }
    return ok({ status: result.status, holdUntil: result.holdUntil });
  }
);
