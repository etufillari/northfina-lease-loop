// GET  /api/contracts[?assetId=&endingFrom=&endingTo=]
// POST /api/contracts   body: { quoteId, customerId, accepted, actor, signedOn?, startDate? }
//
// Signing answers 409 PRICE_CHANGED with `error.details.repriced` when the price list moved
// since the quote. Show the new figures, then post again with them as `accepted`.
// `signedOn` defaults to today and `startDate` to `signedOn`; setting them replays the cards.
import { z } from 'zod';
import { isoDateSchema } from '@/data/schemas';
import { handleRoute, ok, readJsonBody } from '@/server/api-response';
import { listContracts, signContract } from '@/server/contracts';
import { createCustomerAccess } from '@/server/customer-access';
import { db } from '@/server/db';
import { loadPricingData } from '@/server/pricing-data';
import { todayIso } from '@/server/today';

const querySchema = z.object({
  assetId: z.string().min(1).optional(),
  endingFrom: isoDateSchema.optional(),
  endingTo: isoDateSchema.optional(),
});

const bodySchema = z.strictObject({
  quoteId: z.string().min(1),
  customerId: z.string().min(1),
  accepted: z.strictObject({
    monthlyNetRentCents: z.number().int().nonnegative(),
    buyoutNetCents: z.number().int().nonnegative(),
  }),
  actor: z.string().trim().min(1).max(100),
  signedOn: isoDateSchema.optional(),
  startDate: isoDateSchema.optional(),
});

export const GET = handleRoute(async (request) => {
  const { searchParams } = new URL(request.url);
  return ok(await listContracts(db, querySchema.parse(Object.fromEntries(searchParams))));
});

export const POST = handleRoute(async (request) => {
  const { signedOn, startDate, ...body } = await readJsonBody(request, bodySchema);
  const signingDay = signedOn ?? todayIso();
  const contract = await signContract(db, await loadPricingData(), {
    ...body,
    signedOn: signingDay,
    startDate: startDate ?? signingDay,
  });
  const access = await createCustomerAccess(db, {
    contractId: contract.id,
    actor: body.actor,
  });
  return ok({ contract, access }, { status: 201 });
});
