// POST /api/contracts   body: { "assetId", "customerId", "termMonths", "downPaymentCents" }
// Prices the lease again on the server (browser numbers are never trusted), locks it into a
// contract and reserves the asset, with an audit row in the same transaction.
import { z } from 'zod';
import { fail, handleRoute, ok, readJsonBody } from '@/server/api-response';
import { signLease } from '@/server/contracts';
import { db } from '@/server/db';
import { loadLeaseDataPack } from '@/server/lease-data';
import { todayIso } from '@/server/today';

const bodySchema = z.strictObject({
  assetId: z.string().trim().min(1).max(100),
  customerId: z.string().trim().min(1).max(100),
  termMonths: z.number().int().positive(),
  downPaymentCents: z.number().int().nonnegative(),
});

const statusFor: Record<string, number> = {
  asset_not_found: 404,
  unknown_customer: 404,
  asset_not_available: 409,
};

export const POST = handleRoute(async (request) => {
  const body = await readJsonBody(request, bodySchema);
  // No login in the starter: the customer signs for themselves.
  const result = await signLease(db, await loadLeaseDataPack(), {
    ...body,
    today: todayIso(),
    actor: body.customerId,
  });
  if (!result.ok) {
    return fail(
      statusFor[result.reason] ?? 422,
      result.reason.toUpperCase(),
      'The lease cannot be signed'
    );
  }
  return ok({ id: result.id, contract: result.contract }, { status: 201 });
});
