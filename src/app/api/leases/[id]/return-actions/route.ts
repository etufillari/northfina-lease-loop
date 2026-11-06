import { z } from 'zod';
import { handleRoute, ok } from '@/server/api-response';
import { authSettings } from '@/server/auth-config';
import { assertSameOrigin } from '@/server/auth-input';
import { requireIdentity } from '@/server/auth-session';
import { db } from '@/server/db';
import { acceptReturn } from '@/server/recovery';
import { readRecoveryBody } from '@/server/recovery-input';
import { requestToday } from '@/server/demo-mode';

const schema = z.strictObject({
  action: z.enum(['accept', 'buyout']),
  requestId: z.string().min(1).max(100),
  expectedAssessmentUpdatedAt: z.iso.datetime(),
  paymentMethod: z.enum(['card', 'invoice']).optional(),
});
export const POST = handleRoute(
  async (request, { params }: RouteContext<'/api/leases/[id]/return-actions'>) => {
    assertSameOrigin(request, authSettings());
    const identity = await requireIdentity(db, request.headers);
    const { id } = await params;
    const input = await readRecoveryBody(request, schema);
    const result = await acceptReturn(db, {
      ...input,
      contractId: id,
      customerId: identity.customerId,
      userId: identity.id,
      today: requestToday(request),
    });
    return ok(
      { id: result.id, status: result.status },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  }
);
