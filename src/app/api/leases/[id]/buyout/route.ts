import { z } from 'zod';
import { handleRoute, ok } from '@/server/api-response';
import { authSettings } from '@/server/auth-config';
import { assertSameOrigin } from '@/server/auth-input';
import { requireIdentity } from '@/server/auth-session';
import { db } from '@/server/db';
import { payBuyout } from '@/server/lease-actions';
import { readRecoveryBody } from '@/server/recovery-input';
import { requestToday } from '@/server/demo-mode';
const schema = z.strictObject({
  token: z.uuid(),
  quoteDate: z.iso.date(),
  expectedTotalCents: z.number().int().nonnegative(),
  paymentMethod: z.enum(['card', 'invoice']),
});
export const POST = handleRoute(
  async (request, { params }: RouteContext<'/api/leases/[id]/buyout'>) => {
    assertSameOrigin(request, authSettings());
    const identity = await requireIdentity(db, request.headers);
    const { id } = await params;
    const input = await readRecoveryBody(request, schema);
    const receiptId = await payBuyout(db, {
      ...input,
      customerId: identity.customerId,
      userId: identity.id,
      contractId: id,
      today: requestToday(request),
    });
    return ok({ receiptId }, { status: 201, headers: { 'Cache-Control': 'no-store' } });
  }
);
