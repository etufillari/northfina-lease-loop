// GET /api/demo-date: the date the app runs on, for the header.
// PUT /api/demo-date   body: { "date": "2026-11-05" }, or { "date": null } for the real date.
// Moving the date closes any contract left past its choice window and brings future invoices
// up to the current VAT rates at once, without waiting for the scheduler, so a demo shows the
// result straight away.
import { z } from 'zod';
import { isoDateSchema } from '@/data/schemas';
import { identityId } from '@/domain/identity';
import { requireRole } from '@/server/auth/actor';
import { handleRoute, ok, readJsonBody } from '@/server/api-response';
import { getAppDate, setDemoDate } from '@/server/date/app-date';
import { db } from '@/server/db';
import { closeExpiredContracts } from '@/server/end-of-term/contract-end';
import { refreshFutureVat } from '@/server/invoicing/future-vat';

const bodySchema = z.strictObject({ date: isoDateSchema.nullable() });

export const GET = handleRoute(async () => ok(await getAppDate(db)));

export const PUT = handleRoute(async (request) => {
  const actor = await requireRole('demo.configure');
  const body = await readJsonBody(request, bodySchema);
  const appDate = await setDemoDate(db, { date: body.date, actor: identityId(actor) });
  await closeExpiredContracts(db, appDate.date);
  await refreshFutureVat(db, appDate.date);
  return ok(appDate);
});
