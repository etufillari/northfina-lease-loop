// GET /api/demo-date: the date the app runs on, for the header.
// PUT /api/demo-date   body: { "date": "2026-11-05" }, or { "date": null } for the real date.
import { z } from 'zod';
import { isoDateSchema } from '@/data/schemas';
import { identityId } from '@/domain/identity';
import { requireRole } from '@/server/actor';
import { handleRoute, ok, readJsonBody } from '@/server/api-response';
import { getAppDate, setDemoDate } from '@/server/app-date';
import { db } from '@/server/db';

const bodySchema = z.strictObject({ date: isoDateSchema.nullable() });

export const GET = handleRoute(async () => ok(await getAppDate(db)));

export const PUT = handleRoute(async (request) => {
  const actor = await requireRole('demo.configure');
  const body = await readJsonBody(request, bodySchema);
  return ok(await setDemoDate(db, { date: body.date, actor: identityId(actor) }));
});
