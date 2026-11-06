// POST /api/fleets
// body: { "assetIds": ["laptop-001", "laptop-002"], "termMonths": 36, "answers": { ... } }
// One application for several items, decided as one deal; see src/server/fleets.ts.
import { z } from 'zod';
import { MAX_FLEET_ITEMS } from '@/domain/fleet';
import { fail, handleRoute, ok, readJsonBody } from '@/server/api-response';
import { appDate } from '@/server/app-date';
import { currentViewer } from '@/server/current-viewer';
import { db } from '@/server/db';
import { submitFleetApplication } from '@/server/fleets';
import { viewerCustomerId } from '@/server/viewer';

const bodySchema = z.strictObject({
  assetIds: z.array(z.string().trim().min(1).max(50)).max(MAX_FLEET_ITEMS + 1),
  termMonths: z.number().int().positive(),
  /** Question id → answer. Bounded so a request can't flood the database. */
  answers: z
    .record(z.string().regex(/^q_[a-z0-9_]+$/), z.string().max(500))
    .refine((answers) => Object.keys(answers).length <= 50, 'too many answers'),
});

const failures = {
  too_few: [422, 'TOO_FEW', 'A fleet needs at least two items'],
  too_many: [422, 'TOO_MANY', 'A fleet can have at most 20 items'],
  duplicate: [422, 'DUPLICATE', 'The same item is in the fleet twice'],
  mixed_categories: [422, 'MIXED_CATEGORIES', 'A fleet has items of one category'],
  business_only: [422, 'BUSINESS_ONLY', 'Fleets are for companies and sole traders'],
  incomplete: [422, 'INCOMPLETE', 'Some questions are still unanswered'],
  asset_not_found: [404, 'NOT_FOUND', 'Asset not found'],
  asset_not_available: [409, 'ASSET_NOT_AVAILABLE', 'An item cannot be leased right now'],
  cannot_quote: [422, 'CANNOT_QUOTE', 'An item cannot be priced for this term'],
} as const;

export const POST = handleRoute(async (request) => {
  const body = await readJsonBody(request, bodySchema);
  const customerId = viewerCustomerId(await currentViewer());
  const result = await submitFleetApplication(db, { ...body, customerId }, (await appDate()).today);
  if (!result.ok) {
    const [status, code, message] = failures[result.reason];
    return fail(status, code, message, result.assetId ? { assetId: result.assetId } : undefined);
  }
  return ok(
    { id: result.fleetId, decision: result.decision, applicationIds: result.applicationIds },
    { status: 201 }
  );
});
