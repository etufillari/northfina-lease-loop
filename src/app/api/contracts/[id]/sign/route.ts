// POST /api/contracts/:id/sign   no body
// The person a contract is waiting for signs it (D-053): it becomes active from the effective
// today (D-030), with the price locked when it was sent. A demo action: there is no e-signature
// service, so the page signs as that person. Audited in the same transaction.
import { fail, handleRoute, ok } from '@/server/api-response';
import { asOfDate } from '@/server/as-of';
import { countersignContract, type CountersignRefusal } from '@/server/awaiting-signature';
import { db } from '@/server/db';

// Every refusal has a status here (the compiler checks), and a message in the UI (D-038).
const statusFor = {
  contract_not_found: 404,
  not_awaiting_signature: 409,
  signed_before_sent: 409,
} satisfies Record<CountersignRefusal, number>;

export const POST = handleRoute(
  async (_request, { params }: RouteContext<'/api/contracts/[id]/sign'>) => {
    const { id } = await params;
    if (!/^\d+$/.test(id)) return fail(404, 'CONTRACT_NOT_FOUND', `No contract with id "${id}"`);
    const result = await countersignContract(db, {
      contractId: Number(id),
      today: await asOfDate(),
    });
    if (!result.ok) {
      return fail(
        statusFor[result.reason],
        result.reason.toUpperCase(),
        'The contract cannot be signed'
      );
    }
    return ok({ contract: result.contract });
  }
);
