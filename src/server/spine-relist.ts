import { loadCustomers, loadRefurbishmentCosts } from '@/data/load';
import { maintenanceAfterWork, missingReadinessTasks, refurbishmentPlan } from '@/domain/lifecycle';
import type { AssetRelease } from '@/generated/prisma/client';
import { ApiError } from './api-response';
import { toAsset } from './assets';
import { withAudit } from './audit';
import type { DemoContext } from './demo-context';
import { requireOperator } from './demo-context';
import type { PrismaClient } from './prisma-client';
import { rethrowDatabaseConflict, requestHash, requireSameRequest } from './request-integrity';
import type { RelistInput } from './spine-shapes';
import { readMaintenance } from './spine-maintenance';
import { previewSecondLife } from './second-life-matching';
import { selectSecondLifeCandidate } from '@/domain/second-life-selection';
import { readValuationBaseline } from './valuation-baseline';

function releaseView(release: AssetRelease) {
  return {
    assetId: release.asset_id,
    readyOn: release.ready_on,
    offer: {
      priceCents: release.net_price_cents,
      source: `release:${release.revision}`,
      releaseRevision: release.revision,
    },
  };
}

export async function relistAsset(
  db: PrismaClient,
  context: DemoContext,
  assetId: string,
  input: RelistInput
) {
  requireOperator(context);
  const fingerprint = requestHash({ actor: context.actor, assetId, input });
  const [row, previous, lastContract, costs] = await Promise.all([
    db.asset.findUnique({ where: { id: assetId } }),
    db.assetRelease.findUnique({ where: { asset_id: assetId } }),
    db.contract.findFirst({ where: { asset_id: assetId }, orderBy: { life_number: 'desc' } }),
    loadRefurbishmentCosts(),
  ]);
  if (!row) throw new ApiError(404, 'ASSET_NOT_FOUND', 'The item was not found');
  if ((previous?.revision ?? 0) !== input.releaseRevision) {
    throw new ApiError(
      409,
      'RELIST_NOT_ALLOWED',
      'The item has entered another return cycle; refresh'
    );
  }
  if (previous?.relist_request_id === input.requestId) {
    requireSameRequest(previous.relist_request_hash, fingerprint);
    return releaseView(previous);
  }
  if (
    row.status !== 'returned' ||
    (lastContract?.closed_on && lastContract.closed_on > context.businessDate)
  ) {
    throw new ApiError(
      409,
      'RELIST_NOT_ALLOWED',
      'Only a returned item can be prepared for the next lease'
    );
  }
  const maintenance = readMaintenance(previous);
  if (input.matching) {
    const customers = await loadCustomers();
    if (!customers.some((customer) => customer.id === input.matching?.nextCustomerId)) {
      throw new ApiError(422, 'SUCCESSOR_UNKNOWN', 'Select a known next customer');
    }
    if (
      input.matching.readyOn !== context.businessDate ||
      (previous?.reserved_for_customer_id &&
        previous.reserved_for_customer_id !== input.matching.nextCustomerId)
    ) {
      throw new ApiError(409, 'MATCH_CHANGED', 'Refresh the match before allocating');
    }
  }
  const plan = refurbishmentPlan({
    asset: toAsset(row),
    targetCondition: input.condition,
    costs,
    lastServiceUsage: input.lastServiceUsage,
    maintenance,
    acceptsFairCondition: input.condition === 'fair' && input.matching !== undefined,
  });
  if (!plan.ok)
    throw new ApiError(422, 'READINESS_UNAVAILABLE', 'The required work cannot be determined', {
      reason: plan.reason,
    });
  const missing = missingReadinessTasks(plan.tasks, input.completedTaskIds);
  if (missing.length > 0)
    throw new ApiError(422, 'READINESS_INCOMPLETE', 'Complete all required work before relisting', {
      taskIds: missing,
    });

  const matchingDecision: Record<string, unknown> = {};
  const baselineAudit: Record<string, unknown> = {};
  try {
    const release = await withAudit(
      db,
      {
        actor: context.actor,
        action: 'asset.relisted',
        entityType: 'asset',
        entityId: assetId,
        details: {
          businessDate: context.businessDate,
          revision: input.releaseRevision,
          netPriceCents: input.netPriceCents,
          valuationReason: input.valuationReason,
          condition: input.condition,
          valuationBaseline: baselineAudit,
          taskIds: plan.tasks.map((task) => task.id),
          ...(input.matching ? { matching: input.matching } : {}),
          ...(input.matching ? { matchingDecision } : {}),
        },
      },
      async (tx) => {
        const latest = await tx.assetRelease.findUnique({ where: { asset_id: assetId } });
        if ((latest?.revision ?? 0) !== input.releaseRevision)
          throw new ApiError(409, 'RELIST_NOT_ALLOWED', 'The return cycle changed');
        let baseline = await readValuationBaseline(tx, assetId);
        if (input.matching) {
          const preview = await previewSecondLife(tx, context, assetId, {
            ...input.matching,
            lastServiceUsage: input.lastServiceUsage,
          });
          if (input.matching.useAutomaticBaseline) baseline = preview.valuationBaseline;
          const selection = selectSecondLifeCandidate(preview, {
            requestId: input.matching.waitingRequestId,
            condition: input.condition,
            overrideReason: input.matching.overrideReason,
          });
          const selected = selection.ok ? selection.candidate : null;
          if (
            !selected ||
            selected.customerId !== input.matching.nextCustomerId ||
            selected.waitingRevision !== (input.matching.waitingRevision ?? null) ||
            selected.requestId !== input.matching.waitingRequestId ||
            selected.condition !== input.condition ||
            selected.netPriceCents !== input.netPriceCents ||
            (latest?.reserved_for_customer_id &&
              latest.reserved_for_customer_id !== input.matching.nextCustomerId)
          ) {
            throw new ApiError(
              409,
              'MATCH_CHANGED',
              'The selected match changed or requires an override reason; review it again'
            );
          }
          Object.assign(matchingDecision, {
            override: selection.ok && selection.override,
            recommended: preview.recommendation
              ? {
                  requestId: preview.recommendation.requestId,
                  condition: preview.recommendation.condition,
                  monthlyNetCents: preview.recommendation.monthlyNetCents,
                  workNetCents: preview.recommendation.workNetCents,
                }
              : null,
          });
          // Imported requests are consumed by the matching audit in this transaction.
          // Registered requests additionally change their customer-managed status.
          if (!selected.imported) {
            const allocated = await tx.waitingRequest.updateMany({
              where: {
                id: selected.requestId,
                customer_id: selected.customerId!,
                status: 'pending',
                revision: selected.waitingRevision!,
              },
              data: { status: 'allocated', pending_key: null, allocated_asset_id: assetId },
            });
            if (allocated.count !== 1)
              throw new ApiError(409, 'MATCH_CHANGED', 'The waiting request has changed');
          }
        }
        if (baseline) Object.assign(baselineAudit, baseline);
        const updated = await tx.asset.updateMany({
          where: {
            id: assetId,
            status: 'returned',
            condition: row.condition,
            usage_value: row.usage_value,
          },
          data: {
            condition: input.condition,
            status: 'available',
            ...(baseline ? { valuation_baseline_json: JSON.stringify(baseline) } : {}),
          },
        });
        if (updated.count !== 1)
          throw new ApiError(409, 'RELIST_NOT_ALLOWED', 'The item is no longer awaiting relisting');
        const values = {
          ...(input.matching ? { reserved_for_customer_id: input.matching.nextCustomerId } : {}),
          net_price_cents: input.netPriceCents,
          ready_on: context.businessDate,
          readiness_json: JSON.stringify({
            ...(input.matching ? { matching: input.matching } : {}),
            tasks: plan.tasks,
            totalNetCents: plan.totalNetCents,
            usageBefore: row.usage_value,
            maintenance: maintenanceAfterWork({
              previous: maintenance,
              tasks: plan.tasks,
              usageValue: row.usage_value,
              lastServiceUsage: input.lastServiceUsage,
            }),
          }),
          valuation_reason: input.valuationReason,
          relist_request_id: input.requestId,
          relist_request_hash: fingerprint,
        };
        // Record service/reset evidence, while preserving the physical item's cumulative meter.
        return tx.assetRelease.upsert({
          where: { asset_id: assetId },
          create: { asset_id: assetId, revision: 0, ...values },
          update: values,
        });
      }
    );
    return releaseView(release);
  } catch (error) {
    const committed = await db.assetRelease.findUnique({ where: { asset_id: assetId } });
    if (committed?.relist_request_id === input.requestId) {
      requireSameRequest(committed.relist_request_hash, fingerprint);
      return releaseView(committed);
    }
    rethrowDatabaseConflict(error);
  }
}
