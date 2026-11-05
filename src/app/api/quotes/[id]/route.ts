// GET /api/quotes/:id   The stored quote, whether it can be signed today (open, expired, not yet
// valid or used) and, while open, what signing today would change (D-014, D-034).
import { fail, handleRoute, ok } from '@/server/api-response';
import { asOfDate } from '@/server/as-of';
import { db } from '@/server/db';
import { loadLeaseDataPack } from '@/server/lease-data';
import { viewQuote } from '@/server/quotes';

export const GET = handleRoute(async (_request, { params }: RouteContext<'/api/quotes/[id]'>) => {
  const { id } = await params;
  const found = /^\d+$/.test(id)
    ? await viewQuote(db, await loadLeaseDataPack(), Number(id), await asOfDate())
    : null;
  if (!found) return fail(404, 'QUOTE_NOT_FOUND', `No quote with id "${id}"`);
  return ok(found);
});
