// POST /api/customer-portal/:token/buyout: customer requests an end-of-term buyout.
import { z } from 'zod';
import { handleRoute, ok, readJsonBody } from '@/server/api-response';
import { getContractByAccessToken } from '@/server/customer-access';
import { db } from '@/server/db';
import { createBuyoutRequest } from '@/server/buyouts';

const bodySchema = z.strictObject({});

export const POST = handleRoute(
  async (request, { params }: RouteContext<'/api/customer-portal/[token]/buyout'>) => {
    const { token } = await params;
    await readJsonBody(request, bodySchema);
    const contract = await getContractByAccessToken(db, token);
    return ok(
      await createBuyoutRequest(db, {
        contractId: contract.id,
        customerId: contract.customer_id,
        actor: contract.customer_id,
      }),
      { status: 201 }
    );
  }
);
