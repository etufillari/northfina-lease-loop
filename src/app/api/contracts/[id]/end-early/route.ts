// POST /api/contracts/:id/end-early   body: { kind: 'early_buy', month }
//                                          | { kind: 'early_hand_back', month, condition, usageValue }
// `month` is the exit month the price was shown for; a stale one is refused (D-045).
// Leaves the lease in the current month (D-033): records the ending with every line of its
// price, sells or takes back the asset, audited together.
import { z } from 'zod';
import { loadResidualCurves } from '@/data/load';
import { assetConditionSchema } from '@/data/schemas';
import { fail, handleRoute, ok, readJsonBody } from '@/server/api-response';
import { getContract } from '@/server/contracts';
import { db } from '@/server/db';
import { endLeaseEarly, type EndEarlyRefusal } from '@/server/early-exit';
import { loadLeaseDataPack } from '@/server/lease-data';
import { asOfDate } from '@/server/as-of';

const monthSchema = z.number().int().min(1).max(1_200);
const bodySchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('early_buy'), month: monthSchema }),
  z.strictObject({
    kind: z.literal('early_hand_back'),
    month: monthSchema,
    condition: assetConditionSchema,
    usageValue: z.number().int().nonnegative().max(10_000_000),
  }),
]);

// Every refusal has a status here (the compiler checks), and a message in the UI (D-038).
const statusFor = {
  contract_not_found: 404,
  already_ended: 409,
  asset_not_leased: 409,
  not_started: 409,
  term_over: 409,
  unknown_band: 422,
  table_changed: 422,
  month_changed: 409,
  no_vat_rate: 422,
  usage_went_down: 422,
  condition_improved: 422,
} satisfies Record<EndEarlyRefusal, number>;

export const POST = handleRoute(
  async (request, { params }: RouteContext<'/api/contracts/[id]/end-early'>) => {
    const { id } = await params;
    const choice = await readJsonBody(request, bodySchema);
    const found = /^\d+$/.test(id) ? await getContract(db, Number(id)) : null;
    if (!found) return fail(404, 'CONTRACT_NOT_FOUND', `No contract with id "${id}"`);

    const [data, curves] = await Promise.all([loadLeaseDataPack(), loadResidualCurves()]);
    // No login in the starter: the customer on the contract makes the choice.
    const result = await endLeaseEarly(
      db,
      { vatRates: data.vatRates, coefficientTable: data.coefficientTable, curves },
      { contractId: found.id, choice, today: await asOfDate(), actor: found.contract.customerId }
    );
    if (!result.ok) {
      return fail(
        statusFor[result.reason],
        result.reason.toUpperCase(),
        'The lease cannot be ended early'
      );
    }
    return ok({ ending: result.ending }, { status: 201 });
  }
);
