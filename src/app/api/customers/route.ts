// GET  /api/customers — the persona picker list.
// POST /api/customers  body: { name, email, type? } — "add an empty user" (the demo's sign-up;
// a real login creates the account instead); the rest
// of the profile is filled in by their first application.
import { z } from 'zod';
import { fail, handleRoute, ok, readJsonBody } from '@/server/api-response';
import { createCustomer, listCustomers } from '@/server/customers';
import { db } from '@/server/db';

export const GET = handleRoute(async () => ok(await listCustomers(db)));

const bodySchema = z.strictObject({
  name: z.string().trim().min(1).max(200),
  // An "empty user" needs only a name; the email is asked again in every application.
  email: z.union([z.email(), z.literal('')]).default(''),
  type: z.enum(['consumer', 'sole_trader', 'company']).default('consumer'),
});

export const POST = handleRoute(async (request) => {
  const body = await readJsonBody(request, bodySchema);
  if (!body) return fail(400, 'INVALID_JSON', 'Bad body');
  // Signing up is done by the new person themself: the audit log names them.
  const customer = await createCustomer(db, { ...body, actor: body.name });
  return ok(customer, { status: 201 });
});
