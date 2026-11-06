// POST /api/staff/applications/:id/approve  body: { note? }
// A person approves a manual review: a fresh 7-day hold from the as-of date, audit-logged.
import { z } from 'zod';
import { fail, handleRoute, ok, readJsonBody } from '@/server/api-response';
import { asOfFrom } from '@/server/as-of';
import { db } from '@/server/db';
import { approveApplication } from '@/server/staff';
import { requireStaff } from '@/server/current-user';

const bodySchema = z.strictObject({
  note: z.string().trim().max(500).optional(),
});

const failures: Record<string, [number, string, string]> = {
  not_found: [404, 'APPLICATION_NOT_FOUND', 'No such application'],
  self_decision: [403, 'SELF_DECISION', 'Nobody can decide on their own application'],
  staff_only: [403, 'STAFF_ONLY', 'This is for Northfina staff only'],
  not_reviewable: [409, 'NOT_REVIEWABLE', 'Only an application in manual review can be approved'],
  asset_unavailable: [
    409,
    'ASSET_UNAVAILABLE',
    'The item has been leased or reserved by someone else during the review. Decline instead.',
  ],
};

export const POST = handleRoute(
  async (request, { params }: RouteContext<'/api/staff/applications/[id]/approve'>) => {
    const { id } = await params;
    const user = await requireStaff();
    if (user instanceof Response) return user;
    const body = await readJsonBody(request, bodySchema);
    const result = await approveApplication(db, {
      applicationId: id,
      actor: user.actorId,
      isStaff: user.isStaff,
      note: body.note,
      asOf: await asOfFrom(request),
    });
    if (!result.ok) {
      const [status, code, message] = failures[result.reason]!;
      return fail(status, code, message);
    }
    return ok({ status: result.status, holdUntil: result.holdUntil });
  }
);
