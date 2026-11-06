import type { Asset, ResidualCurves } from '@/data/schemas';
import type { WorkPlan } from './refurbishment';
import { residualValue, assetAgeMonths } from './valuation';
/** Conservative advisory screen, not a profit model: financing and overhead are excluded. */
export function assessRefurbishment(
  proposedNetCents: number,
  workCostCents: number,
  feasibleRequests: number,
  asIsNetCents = 0
) {
  if (
    ![proposedNetCents, workCostCents, feasibleRequests, asIsNetCents].every(
      Number.isSafeInteger
    ) ||
    proposedNetCents < 0 ||
    workCostCents < 0 ||
    feasibleRequests < 0 ||
    asIsNetCents < 0
  )
    throw new RangeError('Invalid refurbishment assessment');
  const incrementalNetCents = proposedNetCents - asIsNetCents - workCostCents;
  if (!Number.isSafeInteger(incrementalNetCents)) throw new RangeError('Assessment overflow');
  return {
    asIsNetCents,
    upliftNetCents: proposedNetCents - asIsNetCents,
    incrementalNetCents,
    valueAfterWorkNetCents: proposedNetCents - workCostCents,
    recommendation:
      proposedNetCents - asIsNetCents <= workCostCents
        ? ('REVIEW_COST' as const)
        : feasibleRequests === 0
          ? ('NO_DEMAND' as const)
          : ('REFURBISH' as const),
  };
}

/** Preview the same restored condition/wear and valuation used at work completion. */
export function projectRefurbishment(
  asset: Asset,
  originalNetCents: number,
  plan: WorkPlan,
  availableOn: string,
  curves: ResidualCurves
) {
  const restoredAsset = {
    ...asset,
    condition: plan.resultingCondition,
    usage: { ...asset.usage, value: plan.resultingUsage },
  };
  return {
    restoredAsset,
    asIsNetCents: residualValue(
      asset,
      originalNetCents,
      assetAgeMonths(asset.model_year, availableOn),
      curves
    ),
    priceCents: residualValue(
      restoredAsset,
      originalNetCents,
      assetAgeMonths(asset.model_year, availableOn),
      curves
    ),
  };
}
