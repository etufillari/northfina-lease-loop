// POST /api/customer-portal/:token/return: customer requests an asset return.
import { z } from 'zod';
import { handleRoute, ok, readJsonBody } from '@/server/api-response';
import { getContractByAccessToken } from '@/server/customer-access';
import { db } from '@/server/db';
import { createReturnRequest } from '@/server/returns';

const bodySchema = z.strictObject({});

export const POST = handleRoute(
  async (request, { params }: RouteContext<'/api/customer-portal/[token]/return'>) => {
    const { token } = await params;
    await readJsonBody(request, bodySchema);
    const contract = await getContractByAccessToken(db, token);
    const returnRequest = await createReturnRequest(db, {
      contractId: contract.id,
      customerId: contract.customer_id,
      actor: contract.customer_id,
    });
    return ok(returnRequest, { status: 201 });
  }
);
