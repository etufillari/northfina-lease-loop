// The last two steps of a return: the dealer approves the refurbishment plan, then confirms the
// work is done. Completing is what changes the asset: it gets the condition and usage the plan
// promised and goes back to the catalogue. Steps before this are in ./returns.ts.
import { z } from 'zod';

import { assetStatusSchema } from '@/data/schemas';
import { assetAfterRefurbishment } from '@/domain/return-workflow';

import { ApiError } from './api-response';
import { withAudit } from './audit';
import type { PrismaClient } from './prisma-client';
import { returnPlanSchema } from './return-queries';

export const approveReturnPlanSchema = z.strictObject({
  actor: z.string().trim().min(1).max(100),
});
export type ApproveReturnPlanInput = z.infer<typeof approveReturnPlanSchema>;

export const completeReturnSchema = z.strictObject({
  actor: z.string().trim().min(1).max(100),
});
export type CompleteReturnInput = z.infer<typeof completeReturnSchema>;

const notFound = () =>
  new ApiError(404, 'RETURN_REQUEST_NOT_FOUND', 'This return request does not exist.');

/**
 * Dealer accepts the refurbishment plan and its cost. Nothing changes on the asset yet.
 *
 * Transition: planned -> approved
 */
export async function approveReturnPlan(
  db: PrismaClient,
  returnRequestId: string,
  input: ApproveReturnPlanInput
) {
  const approval = approveReturnPlanSchema.parse(input);

  const existing = await db.returnRequest.findUnique({ where: { id: returnRequestId } });
  if (!existing) throw notFound();

  if (existing.status !== 'planned') {
    throw new ApiError(
      409,
      'RETURN_NOT_PLANNED',
      'Only a return with a refurbishment plan can be approved.'
    );
  }

  return withAudit(
    db,
    {
      actor: approval.actor,
      action: 'return.approved',
      entityType: 'return_request',
      entityId: returnRequestId,
      details: {
        assetId: existing.asset_id,
        targetCondition: existing.target_condition,
        totalCostCents: existing.refurbishment_total_cost_cents,
      },
    },
    async (tx) => {
      const claimed = await tx.returnRequest.updateMany({
        where: { id: returnRequestId, status: 'planned' },
        data: { status: 'approved', approved_at: new Date(), approved_by: approval.actor },
      });

      if (claimed.count !== 1) {
        throw new ApiError(
          409,
          'RETURN_NOT_PLANNED',
          'Only a return with a refurbishment plan can be approved.'
        );
      }

      return tx.returnRequest.findUniqueOrThrow({ where: { id: returnRequestId } });
    }
  );
}

/**
 * Dealer confirms the refurbishment work is done. The asset takes the condition and usage from
 * the approved plan (the saved plan is applied, not recalculated), and it becomes `available`,
 * or stays `reserved` if someone was already promised it. Return, asset and audit row change in
 * one transaction.
 *
 * Transition: approved -> completed
 */
export async function completeReturn(
  db: PrismaClient,
  returnRequestId: string,
  input: CompleteReturnInput
) {
  const completion = completeReturnSchema.parse(input);

  const existing = await db.returnRequest.findUnique({
    where: { id: returnRequestId },
    include: { asset: true },
  });
  if (!existing) throw notFound();

  if (existing.status !== 'approved') {
    throw new ApiError(
      409,
      'RETURN_NOT_APPROVED',
      'Only an approved refurbishment plan can be completed.'
    );
  }

  if (existing.refurbishment_plan_json === null) {
    throw new ApiError(
      409,
      'PLAN_MISSING',
      'The return request does not have a refurbishment plan.'
    );
  }

  const plan = returnPlanSchema.parse(JSON.parse(existing.refurbishment_plan_json));
  const assetStatus = assetStatusSchema.parse(existing.asset.status);
  const result = assetAfterRefurbishment(plan, assetStatus);

  if (!result.ok) {
    throw new ApiError(
      409,
      'ASSET_NOT_RETURNED',
      'The asset is not in a state where refurbishment can be completed.'
    );
  }

  const after = result.asset;

  return withAudit(
    db,
    {
      actor: completion.actor,
      action: 'return.completed',
      entityType: 'return_request',
      entityId: returnRequestId,
      details: {
        assetId: existing.asset_id,
        totalCostCents: plan.totalCostCents,
        asset: {
          condition: { from: existing.asset.condition, to: after.condition },
          usageValue: { from: existing.asset.usage_value, to: after.usage.value },
          status: { from: assetStatus, to: after.status },
        },
      },
    },
    async (tx) => {
      const claimed = await tx.returnRequest.updateMany({
        where: { id: returnRequestId, status: 'approved' },
        data: { status: 'completed', completed_at: new Date(), completed_by: completion.actor },
      });

      if (claimed.count !== 1) {
        throw new ApiError(
          409,
          'RETURN_NOT_APPROVED',
          'Only an approved refurbishment plan can be completed.'
        );
      }

      // Conditional on the status we read, so an asset that changed in between is not overwritten.
      const updated = await tx.asset.updateMany({
        where: { id: existing.asset_id, status: assetStatus },
        data: {
          condition: after.condition,
          usage_value: after.usage.value,
          status: after.status,
        },
      });

      if (updated.count !== 1) {
        throw new ApiError(
          409,
          'ASSET_CHANGED',
          'The asset changed while the refurbishment was being completed. Please try again.'
        );
      }

      return tx.returnRequest.findUniqueOrThrow({ where: { id: returnRequestId } });
    }
  );
}
