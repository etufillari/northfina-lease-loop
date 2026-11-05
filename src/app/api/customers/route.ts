// GET  /api/customers — the persona picker list.
// POST /api/customers  body: { name, email, type?, actor } — "add an empty user"; the rest
// of the profile is filled in by their first application.
import { z } from 'zod';
import { fail, handleRoute, ok, readJsonBody } from '@/server/api-response';
import { createCustomer, listCustomers } from '@/server/customers';
import { db } from '@/server/db';

export const GET = handleRoute(async () => ok(await listCustomers(db)));

const bodySchema = z.strictObject({
  name: z.string().trim().min(1).max(200),
  email: z.email(),
  type: z.enum(['consumer', 'sole_trader', 'company']).default('consumer'),
  actor: z.string().trim().min(1).max(100),
});

export const POST = handleRoute(async (request) => {
  const body = await readJsonBody(request, bodySchema);
  if (!body) return fail(400, 'INVALID_JSON', 'Bad body');
  const customer = await createCustomer(db, body);
  return ok(customer, { status: 201 });
});
