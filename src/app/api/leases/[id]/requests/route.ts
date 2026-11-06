import { z } from 'zod';
import { handleRoute, ok } from '@/server/api-response';
import { authSettings } from '@/server/auth-config';
import { assertSameOrigin } from '@/server/auth-input';
import { requireIdentity } from '@/server/auth-session';
import { db } from '@/server/db';
import { requestToday } from '@/server/demo-mode';
import { requestLeaseChange } from '@/server/leases';
import { readRecoveryBody, recoveryReportSchema } from '@/server/recovery-input';

const bodySchema = z.strictObject({
  kind: z.enum(['return', 'buyout', 'exchange']),
  report: recoveryReportSchema.optional(),
});

export const POST = handleRoute(
  async (request, { params }: RouteContext<'/api/leases/[id]/requests'>) => {
    assertSameOrigin(request, authSettings());
    const identity = await requireIdentity(db, request.headers);
    const { id } = await params;
    const { kind, report } = await readRecoveryBody(request, bodySchema);
    const created = await requestLeaseChange(db, {
      customerId: identity.customerId,
      userId: identity.id,
      contractId: id,
      kind,
      report,
      today: requestToday(request),
    });
    return ok(
      { id: created.id, kind: created.kind, status: created.status },
      { status: 201, headers: { 'Cache-Control': 'no-store' } }
    );
  }
);
