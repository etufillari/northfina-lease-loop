// GET  /api/contracts/:id/invoices   every invoice, issued or forecast, with totals
// POST /api/contracts/:id/invoices   body: { actor, asOf? }   issues what is due; safe to repeat
import { z } from 'zod';
import { isoDateSchema } from '@/data/schemas';
import { handleRoute, ok, readJsonBody } from '@/server/api-response';
import { db } from '@/server/db';
import { getInvoiceTimeline, issueInvoices } from '@/server/invoices';
import { loadPricingData } from '@/server/pricing-data';
import { todayIso } from '@/server/today';

const bodySchema = z.strictObject({
  actor: z.string().trim().min(1).max(100),
  asOf: isoDateSchema.optional(),
});

export const GET = handleRoute(
  async (_request, { params }: RouteContext<'/api/contracts/[id]/invoices'>) => {
    const { id } = await params;
    return ok(await getInvoiceTimeline(db, await loadPricingData(), id));
  }
);

export const POST = handleRoute(
  async (request, { params }: RouteContext<'/api/contracts/[id]/invoices'>) => {
    const { id } = await params;
    const { actor, asOf } = await readJsonBody(request, bodySchema);
    const data = await loadPricingData();
    const { issued } = await issueInvoices(db, data, {
      contractId: id,
      asOf: asOf ?? todayIso(),
      actor,
    });
    return ok({ issued, timeline: await getInvoiceTimeline(db, data, id) });
  }
);
