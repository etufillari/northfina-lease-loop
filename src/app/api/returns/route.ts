import { z } from 'zod';
import { createReturnRequest } from '@/server/returns';
import { listReturnRequests } from '@/server/return-queries';
import { db } from '@/server/db';
import { handleRoute, ok, readJsonBody } from '@/server/api-response';

const requestSchema = z.strictObject({
  contractId: z.string().min(1),
  customerId: z.string().min(1),
  expectedReturnDate: z.iso.date().optional(),
  actor: z.string().min(1),
});

export const POST = handleRoute(async (request) => {
  const body = await readJsonBody(request, requestSchema);

  const result = await createReturnRequest(db, body);

  return ok({
    returnRequest: result,
    assetStatusChanged: false,
  });
});

export const GET = handleRoute(async (request) => {
  const status = new URL(request.url).searchParams.get('status') ?? undefined;

  return ok({ returnRequests: await listReturnRequests(db, { status }) });
});
