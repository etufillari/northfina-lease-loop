import type { Asset, AssetCondition, RefurbishmentCosts } from '@/data/schemas';
import {
  refurbishmentPlan,
  type MaintenanceBaselines,
  type RefurbishmentResult,
} from './lifecycle';
import { residualValue, type ResidualValueInput, type ResidualValueResult } from './residual-value';

export type RefurbishmentOption = {
  condition: AssetCondition;
  requiresFairAcceptance: boolean;
  work: RefurbishmentResult;
  valuation: ResidualValueResult;
  /** Estimated resale value less all required work; not accounting profit. */
  netRecoveryCents: number | null;
  /** Zero recovery is break-even; unknown history cannot establish viability. */
  economicallyViable: boolean | null;
};

/**
 * Compare supported conditions without downgrading the item or claiming work is complete.
 * Fair is a conditional option only: matching must find a customer who accepts it.
 * Market value excludes repair costs; net recovery subtracts them once, in integer cents.
 */
export function compareRefurbishmentPlans(
  input: ResidualValueInput & {
    asset: Asset;
    costs: RefurbishmentCosts;
    maintenance?: MaintenanceBaselines;
    lastServiceUsage?: number;
  }
): { currentValue: ResidualValueResult; options: RefurbishmentOption[] } {
  const conditions: readonly AssetCondition[] = ['new', 'like_new', 'good', 'fair', 'poor'];
  const currentRank = conditions.indexOf(input.asset.condition);
  const options = conditions
    .filter((condition, rank) => condition !== 'poor' && rank <= currentRank)
    .map((condition): RefurbishmentOption => {
      const work = refurbishmentPlan({
        asset: input.asset,
        targetCondition: condition,
        costs: input.costs,
        maintenance: input.maintenance,
        lastServiceUsage: input.lastServiceUsage,
        acceptsFairCondition: condition === 'fair',
      });
      const valuation = residualValue({ ...input, asset: { ...input.asset, condition } });
      const netRecoveryCents =
        work.ok && valuation.ok ? valuation.marketValueCents - work.totalNetCents : null;
      return {
        condition,
        requiresFairAcceptance: condition === 'fair',
        work,
        valuation,
        netRecoveryCents,
        economicallyViable: netRecoveryCents === null ? null : netRecoveryCents >= 0,
      };
    });
  return { currentValue: residualValue(input), options };
}
