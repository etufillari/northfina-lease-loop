// GET /api/invoices[?contract_id=con-...&status=issued]
// A customer gets the invoices on their own contracts. Staff get every invoice.
// `vat_change` on a rent says what changed since the previous rent, or is null when nothing did.
import { z } from 'zod';
import { invoiceStatusSchema } from '@/data/lease-schemas';
import { handleRoute, ok } from '@/server/api-response';
import { requireContractListScope } from '@/server/auth/actor';
import { db } from '@/server/db';
import { listInvoices } from '@/server/invoicing/invoices';

const querySchema = z.strictObject({
  contract_id: z.string().min(1).optional(),
  status: invoiceStatusSchema.optional(),
});

export const GET = handleRoute(async (request) => {
  const customerId = await requireContractListScope();

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
