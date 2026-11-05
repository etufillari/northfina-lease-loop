// POST /api/applications   body: { "assetId": "ebike-003", "termMonths": 36, "answers": {...}, "actor": "applicant" }
// Records the submitted lease application and writes an audit row.
import { z } from 'zod';
import { handleRoute, ok, readJsonBody } from '@/server/api-response';
import { submitApplication } from '@/server/applications';
import { db } from '@/server/db';

const submitApplicationSchema = z.strictObject({
  assetId: z.string().trim().min(1).optional().default('ebike-003'),
  termMonths: z.number().int().positive().optional().default(36),
  monthlyRentCents: z.number().int().nonnegative().optional().default(10730),
  answers: z.record(z.string(), z.unknown()),
  actor: z.string().trim().min(1).max(100).optional().default('applicant'),
});

export const POST = handleRoute(async (request) => {
  const body = await readJsonBody(request, submitApplicationSchema);
  const result = await submitApplication(db, body);
  return ok(result, { status: 201 });
});

export const GET = handleRoute(async () => {
  return ok({
    status: 'ready',
    endpoint: '/api/applications',
  });
});
