import { assetCategorySchema } from '@/data/schemas';
import { evaluateInspection } from '@/domain/inspection';
import { ApiError, handleRoute, ok } from '@/server/api-response';
import { authSettings } from '@/server/auth-config';
import { assertSameOrigin } from '@/server/auth-input';
import { requireStaff } from '@/server/auth-session';
import { db } from '@/server/db';
import { assessReturn, findReturnCase, progressReturn } from '@/server/recovery';
import { readRecoveryBody, staffRecoveryActionSchema } from '@/server/recovery-input';
import { publishRelisting } from '@/server/relisting';
import { requestToday } from '@/server/demo-mode';

/** An itemized inspection is much larger than the other recovery requests. */
const maxActionBytes = 32 * 1024;

export const POST = handleRoute(
  async (request, { params }: RouteContext<'/api/staff/returns/[id]'>) => {
    assertSameOrigin(request, authSettings());
    const staff = await requireStaff(db, request.headers);
    const { id } = await params;
    const input = await readRecoveryBody(request, staffRecoveryActionSchema, maxActionBytes);
    const today = requestToday(request);
    const result = await perform();
    return ok(
      { id: result.id, status: result.status },
      { headers: { 'Cache-Control': 'no-store' } }
    );

    async function perform() {
      switch (input.action) {
        case 'assess': {
          const found = await findReturnCase(db, id);
          if (!found) throw new ApiError(404, 'NOT_FOUND', 'Return request not found.');
          const category = assetCategorySchema.parse(found.contract.asset.category);
          return assessReturn(db, {
            requestId: id,
            staffId: staff.id,
            today,
            inspection: {
              condition: input.condition,
              targetCondition: input.targetCondition,
              usageValue: input.usageValue,
              ageMonths: input.ageMonths,
              additionalRepairCents: evaluateInspection(category, input.record).repairNetCents,
              notes: input.notes,
              record: input.record,
            },
          });
        }
        case 'publish':
          return publishRelisting(db, {
            requestId: id,
            staffId: staff.id,
            today,
            expectedPriceCents: input.expectedPriceCents,
          });
        default:
          return progressReturn(db, {
            requestId: id,
            staffId: staff.id,
            today,
            action: input.action,
          });
      }
    }
  }
);
