// GET /api/transfers/:token — the lease behind a take-over link, for the recipient.
import { fail, handleRoute, ok } from '@/server/api-response';
import { db } from '@/server/db';
import { getTransferOffer } from '@/server/transfers';

export const GET = handleRoute(
  async (_request, { params }: RouteContext<'/api/transfers/[token]'>) => {
    const { token } = await params;
    const offer = await getTransferOffer(db, token);
    if (!offer) return fail(404, 'TRANSFER_NOT_FOUND', 'This transfer link is no longer valid');
    return ok(offer);
  }
);
