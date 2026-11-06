// POST /api/applications
// body: { customerId, assetId, date, downPaymentCents, termMonths, answers, actor }
import { handleRoute, ok, readJsonBody } from '@/server/api-response';
import { db } from '@/server/db';
import { applicationSubmissionRequestSchema, createApplication } from '@/server/applications';
import { throwApplicationError } from '@/server/application-errors';

export const POST = handleRoute(async (request) => {
  const input = await readJsonBody(request, applicationSubmissionRequestSchema);
  const result = await createApplication(db, input);
  if (!result.ok) throwApplicationError(result);
  return ok({ application: result.application }, { status: 201 });
});
