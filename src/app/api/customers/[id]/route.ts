// GET /api/customers/:id — the profile: the customer, their contracts and invoices.
// PUT /api/customers/:id  body: { defaults, actor } — save answers as prefill defaults
// (only ever called on the customer's explicit opt-in in the form).
import { z } from 'zod';
import { fail, handleRoute, ok, readJsonBody } from '@/server/api-response';
import { listCustomerContracts } from '@/server/contracts';
import { getCustomer, saveDefaults } from '@/server/customers';
import { db } from '@/server/db';

export const GET = handleRoute(
  async (_request, { params }: RouteContext<'/api/customers/[id]'>) => {
    const { id } = await params;
    const customer = await getCustomer(db, id);
    if (!customer) return fail(404, 'CUSTOMER_NOT_FOUND', `No customer with id "${id}"`);
    const contracts = await listCustomerContracts(db, id);
    return ok({ customer, contracts });
  }
);

const putSchema = z.strictObject({
  defaults: z.record(z.string(), z.union([z.string(), z.number(), z.array(z.string())])),
  actor: z.string().trim().min(1).max(100),
});

export const PUT = handleRoute(async (request, { params }: RouteContext<'/api/customers/[id]'>) => {
  const { id } = await params;
  const body = await readJsonBody(request, putSchema);
  const customer = await getCustomer(db, id);
  if (!customer) return fail(404, 'CUSTOMER_NOT_FOUND', `No customer with id "${id}"`);
  return ok(await saveDefaults(db, { customerId: id, defaults: body.defaults, actor: body.actor }));
});
