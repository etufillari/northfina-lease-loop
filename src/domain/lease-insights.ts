import type { AssetCategory, AssetCondition, Co2Factors } from '@/data/schemas';

/** A single current reuse life, discounted by condition; factors are fictional estimates. */
export function reuseEstimate(
  category: AssetCategory,
  condition: AssetCondition,
  previousLives: number,
  factors: Co2Factors
): number {
  if (!Number.isInteger(previousLives) || previousLives < 0)
    throw new RangeError('Invalid previous lives');
  if (previousLives === 0) return 0;
  const conditionShare: Record<AssetCondition, number> = {
    new: 1,
    like_new: 1,
    good: 0.9,
    fair: 0.7,
    poor: 0.4,
  };
  return (
    Math.round(
      factors.manufacturing_new_kg[category] *
        (1 - factors.refurbishment_share_of_new) *
        conditionShare[condition] *
        10
    ) / 10
  );
}

export type RequestKind = 'return' | 'buyout' | 'exchange';
export function canRequestLeaseChange(
  status: string,
  pendingRequests: number
): 'allowed' | 'not_active' | 'already_pending' {
  if (status !== 'active') return 'not_active';
  return pendingRequests > 0 ? 'already_pending' : 'allowed';
}
