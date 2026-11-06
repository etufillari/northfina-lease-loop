// GET /api/invoices/:id
// A customer sees an invoice on their own contract, and staff see any. Anyone else gets a 404,
// the same as for an id that does not exist, so ids cannot be probed.
import { can } from '@/domain/identity';
import { fail, handleRoute, ok } from '@/server/api-response';
import { requireActor } from '@/server/auth/actor';
import { db } from '@/server/db';
import { getInvoice } from '@/server/invoicing/invoices';

export const GET = handleRoute(async (_request, { params }: RouteContext<'/api/invoices/[id]'>) => {
  const actor = await requireActor();
  const { id } = await params;

  const found = await getInvoice(db, id);
  const isOwner = actor.kind === 'customer' && found?.customerId === actor.customer.id;
  if (!found || !(isOwner || can(actor.role, 'contract.view_all'))) {
    return fail(404, 'INVOICE_NOT_FOUND', `No invoice with id "${id}"`);
  }
  return ok(found.invoice);
});
