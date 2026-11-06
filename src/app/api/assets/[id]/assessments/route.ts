// POST /api/assets/:id/assessments   { condition?, usageValue? }  (optional: the inspection, D77)
// Assesses a returned asset on the request's day (the demo clock, never a date from the
// browser) and relists it: the assessment row, the passport events and the asset available at
// its second-life price, in one audited transaction (D12, D13, D61). Admin only, authorized
// first (D73, D74).
import { isAuthzRefusal, type AuthzRefusalCode } from '@/domain/authz/policy';
import { readActor } from '@/server/actor';
import { ApiError, fail, handleRoute, ok } from '@/server/api-response';
import { authorize, forbiddenResponse } from '@/server/authorize';
import { db } from '@/server/db';
import { todayForRequest } from '@/server/demo-clock';
import { assessAsset, toAssessmentResponse, type AssessRefusal } from '@/server/second-life';
import { assessmentBodySchema, assessmentParamsSchema } from '@/server/second-life-schemas';

const STATUS_OF: Record<Exclude<AssessRefusal['code'], AuthzRefusalCode>, number> = {
  asset_not_found: 404,
  asset_not_returned: 409,
  no_list_price: 422,
  demand_taken: 409,
  relist_unpriced: 422,
};

/** The inspection, or {} for no body (the assess button sends none). */
async function readInspection(request: Request) {
  const text = await request.text();
  if (text.trim() === '') return {};
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    throw new ApiError(400, 'INVALID_JSON', 'The request body must be valid JSON');
  }
  return assessmentBodySchema.parse(body);
}

export const POST = handleRoute(
  async (request, { params }: RouteContext<'/api/assets/[id]/assessments'>) => {
    const { id } = assessmentParamsSchema.parse(await params);
    const actor = await readActor(db);
    const auth = await authorize(db, actor, 'assess_asset', { none: true });
    if (!auth.ok && auth.reason.code !== 'not_found') return forbiddenResponse(auth.reason);

    const inspected = await readInspection(request);
    const today = await todayForRequest();
    const result = await assessAsset(db, { assetId: id, actor, today, inspected });
    if (!result.ok) {
      if (isAuthzRefusal(result.reason)) return forbiddenResponse(result.reason);
      return fail(
        STATUS_OF[result.reason.code],
        'ASSESSMENT_REFUSED',
        'The asset cannot be assessed now',
        result.reason
      );
    }
    return ok(toAssessmentResponse(result.view), { status: 201 });
  }
);
