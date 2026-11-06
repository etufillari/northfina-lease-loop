// GET /api/invoices[?contract_id=con-...&status=issued]
// A customer gets the invoices on their own contracts. Staff get every invoice.
// `vat_change` on a rent says what changed since the previous rent, or is null when nothing did.
import { z } from 'zod';
import { invoiceStatusSchema } from '@/data/lease-schemas';
import { can } from '@/domain/identity';
import { ApiError, handleRoute, ok } from '@/server/api-response';
import { requireActor } from '@/server/auth/actor';
import { db } from '@/server/db';
import { listInvoices } from '@/server/invoicing/invoices';

const querySchema = z.strictObject({
  contract_id: z.string().min(1).optional(),
  status: invoiceStatusSchema.optional(),
});

export const GET = handleRoute(async (request) => {
  const actor = await requireActor();
  const customerId = actor.kind === 'customer' ? actor.customer.id : undefined;
  if (customerId === undefined && !can(actor.role, 'contract.view_all')) {
    throw new ApiError(403, 'FORBIDDEN', 'You are not allowed to do this.');
  }

  const searchParams = new URL(request.url).searchParams;
  const query = querySchema.parse(Object.fromEntries(searchParams));
  return ok(
    await listInvoices(db, {
      customerId,
      contractId: query.contract_id,
      status: query.status,
    })
  );
});
