// POST /api/staff/applications/:id { decision: "approve" | "reject", note } (staff only).
import { handleRoute, ok, readJsonBody } from '@/server/api-response';
import { reviewApplication, reviewDecisionSchema } from '@/server/application-review';
import { authSettings } from '@/server/auth-config';
import { assertSameOrigin } from '@/server/auth-input';
import { requireStaff } from '@/server/auth-session';
import { db } from '@/server/db';

export const POST = handleRoute(
  async (request, { params }: RouteContext<'/api/staff/applications/[id]'>) => {
    assertSameOrigin(request, authSettings());
    const staff = await requireStaff(db, request.headers);
    const { id } = await params;
    const input = await readJsonBody(request, reviewDecisionSchema);
    return ok(await reviewApplication(db, { id, staffId: staff.id, ...input }), {
      headers: { 'Cache-Control': 'no-store' },
    });
  }
);
