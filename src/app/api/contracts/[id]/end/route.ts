// POST /api/contracts/:id/end   body: { kind: 'buy' }
//                                    | { kind: 'return', condition, usageValue }
//                                    | { kind: 'pass_on', condition, usageValue, nextLessee }
// Ends the lease (D-029): records the ending, sells or takes back the asset, audited together.
import { z } from 'zod';
import { assetConditionSchema } from '@/data/schemas';
import { fail, handleRoute, ok, readJsonBody } from '@/server/api-response';
import { endLease } from '@/server/contract-endings';
import { getContract } from '@/server/contracts';
import { db } from '@/server/db';
import { loadLeaseDataPack } from '@/server/lease-data';
import { todayIso } from '@/server/today';

const inspection = {
  condition: assetConditionSchema,
  usageValue: z.number().int().nonnegative().max(10_000_000),
};

const bodySchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('buy') }),
  z.strictObject({ kind: z.literal('return'), ...inspection }),
  z.strictObject({
    kind: z.literal('pass_on'),
    ...inspection,
    /** A data-pack persona or the next person's email. */
    nextLessee: z.union([z.string().regex(/^cust-[a-z0-9-]+$/), z.email().max(200)]),
  }),
]);

const statusFor: Record<string, number> = {
  contract_not_found: 404,
  unknown_customer: 404,
  already_ended: 409,
  asset_not_leased: 409,
  too_early: 409,
};

export const POST = handleRoute(
  async (request, { params }: RouteContext<'/api/contracts/[id]/end'>) => {
    const { id } = await params;
    const choice = await readJsonBody(request, bodySchema);
    const found = /^\d+$/.test(id) ? await getContract(db, Number(id)) : null;
    if (!found) return fail(404, 'CONTRACT_NOT_FOUND', `No contract with id "${id}"`);

    // No login in the starter: the customer on the contract makes the choice.
    const result = await endLease(db, await loadLeaseDataPack(), {
      contractId: found.id,
      choice,
      today: todayIso(),
      actor: found.contract.customerId,
    });
    if (!result.ok) {
      return fail(
        statusFor[result.reason] ?? 422,
        result.reason.toUpperCase(),
        'The lease cannot be ended'
      );
    }
    return ok({ ending: result.ending }, { status: 201 });
  }
);
