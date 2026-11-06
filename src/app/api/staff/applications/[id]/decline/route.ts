// POST /api/staff/applications/:id/decline  body: { note? }
// A person declines a waiting application; the asset is released. Audit-logged.
import { z } from 'zod';
import { fail, handleRoute, ok, readJsonBody } from '@/server/api-response';
import { db } from '@/server/db';
import { declineApplication } from '@/server/staff';
import { requireStaff } from '@/server/current-user';

const bodySchema = z.strictObject({
  note: z.string().trim().max(500).optional(),
});

const failures: Record<string, [number, string, string]> = {
  not_found: [404, 'APPLICATION_NOT_FOUND', 'No such application'],
  self_decision: [403, 'SELF_DECISION', 'Nobody can decide on their own application'],
  staff_only: [403, 'STAFF_ONLY', 'This is for Northfina staff only'],
  not_reviewable: [409, 'NOT_REVIEWABLE', 'This application is not waiting for staff'],
};

export const POST = handleRoute(
  async (request, { params }: RouteContext<'/api/staff/applications/[id]/decline'>) => {
    const { id } = await params;
    const user = await requireStaff();
    if (user instanceof Response) return user;
    const body = await readJsonBody(request, bodySchema);
    const result = await declineApplication(db, {
      applicationId: id,
      actor: user.actorId,
      isStaff: user.isStaff,
      note: body.note,
    });
    if (!result.ok) {
      const [status, code, message] = failures[result.reason]!;
      return fail(status, code, message);
    }
    return ok({ status: result.status });
  }
);
