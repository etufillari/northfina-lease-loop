import { z } from 'zod';
import { leaseTermSchema } from '@/domain/application-input';
import { fail, handleRoute, ok, readJsonBody } from '@/server/api-response';
import { submitApplication, applicationResponse } from '@/server/applications';
import { db } from '@/server/db';
import { getActiveUser } from '@/server/active-user';

const bodySchema = z.strictObject({
  applicationId: z.string().trim().min(1).max(100).optional(),
  customerId: z.string().trim().min(1).max(100),
  assetId: z.string().trim().min(1).max(100),
  startDate: z.iso.date(),
  termMonths: leaseTermSchema,
  downPaymentCents: z.number().int().nonnegative().default(0),
  priceListVersion: z.number().int().positive().optional(),
  offerExpiresOn: z.iso.date(),
  actor: z.string().trim().min(1).max(100).optional(),
});

export const POST = handleRoute(async (request) => {
  const body = await readJsonBody(request, bodySchema);
  const activeUser = await getActiveUser();
  const actor = activeUser?.id ?? body.actor ?? 'anonymous';
  const result = await submitApplication(db, { ...body, actor }, new Date());
  if (!result.ok) {
    const errors = {
      customer_not_found: [404, 'CUSTOMER_NOT_FOUND', 'The customer was not found'],
      asset_not_found: [404, 'ASSET_NOT_FOUND', 'The asset was not found'],
      asset_unavailable: [409, 'ASSET_UNAVAILABLE', 'The asset is not available'],
      invalid_offer: [422, 'INVALID_OR_EXPIRED_OFFER', 'The offer is invalid or expired'],
    } as const;
    const [status, code, message] = errors[result.reason];
    return fail(status, code, message);
  }
  return ok(applicationResponse(result.application), { status: 201 });
});
