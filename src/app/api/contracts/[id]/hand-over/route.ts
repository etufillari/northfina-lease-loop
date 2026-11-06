// POST /api/contracts/:id/hand-over   body: {}
// Hands an item passed on to the next person (#65): on or after the handover day, re-lists it at
// the condition they need and stores their quote. They still apply and sign like anyone else.
import { z } from 'zod';
import { fail, handleRoute, ok, readJsonBody } from '@/server/api-response';
import { asOfDate } from '@/server/as-of';
import { db } from '@/server/db';
import { handOver, type HandOverRefusal } from '@/server/hand-over';
import { loadLeaseDataPack } from '@/server/lease-data';
import { loadSecondLifeDataPack } from '@/server/second-life';

const bodySchema = z.strictObject({});

// Every refusal has a status here (the compiler checks), and a message in the UI (D-038).
const statusFor = {
  contract_not_found: 404,
  asset_not_found: 404,
  not_passed_on: 409,
  already_handed_over: 409,
  too_early: 409,
  asset_not_returned: 409,
  asset_not_available: 409,
  no_price: 422,
  waiting_list_not_a_match: 422,
  target_not_allowed: 422,
  unknown_asset: 422,
  below_minimum: 422,
  above_maximum: 422,
  unknown_term: 422,
  down_payment_negative: 422,
  down_payment_off_step: 422,
  down_payment_too_large: 422,
  no_price_list_on_date: 422,
} satisfies Record<HandOverRefusal, number>;

export const POST = handleRoute(
  async (request, { params }: RouteContext<'/api/contracts/[id]/hand-over'>) => {
    const { id } = await params;
    await readJsonBody(request, bodySchema);
    if (!/^\d+$/.test(id)) return fail(404, 'CONTRACT_NOT_FOUND', `No contract with id "${id}"`);

    const [lease, secondLife] = await Promise.all([loadLeaseDataPack(), loadSecondLifeDataPack()]);
    const result = await handOver(
      db,
      { lease, secondLife },
      { contractId: Number(id), today: await asOfDate() }
    );
    if (!result.ok) {
      return fail(
        statusFor[result.reason],
        result.reason.toUpperCase(),
        'The item cannot be handed over',
        // For too_early: the handover day, from which it can.
        result.opensOn ? { opensOn: result.opensOn } : undefined
      );
    }
    return ok({ quoteId: result.quoteId }, { status: 201 });
  }
);
