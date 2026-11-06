import type {
  Asset,
  AssetCondition,
  CoefficientTable,
  PriceList,
  ResidualCurves,
  SecondLifeRequest,
} from '@/data/schemas';
import { isoDateSchema } from '@/data/schemas';
import { leasePriceFor, type LeasePriceResult } from '../pricing/pricing';
import { residualValueFor, type ResidualValueResult } from './residual-value';

const conditionRank: Record<AssetCondition, number> = {
  poor: 0,
  fair: 1,
  good: 2,
  like_new: 3,
  new: 4,
};

export type LifecycleMetadataSource = 'stored' | 'demo_fallback';

export type LifecyclePricingMetadata = {
  firstLeasedOn: string;
  originalListPriceCents: number;
  source: LifecycleMetadataSource;
  originalPriceListVersion: number | null;
};

export type MatchPricing = {
  marketValueCents: number;
  originalListPriceCents: number;
  originalPriceListVersion: number | null;
  ageMonths: number;
  curvePercent: number;
  conditionMultiplier: number;
  usageAdjustmentPercent: number;
  termMonths: number;
  coefficientBand: string;
  monthlyNetRentCents: number;
  totalCostWithBuyoutCents: number;
};

export type MatchCandidateReason =
  | 'category_mismatch'
  | 'condition_below_minimum'
  | 'needed_by_expired'
  | 'rent_over_budget'
  | 'term_not_supported'
  | 'price_below_minimum'
  | 'price_above_maximum';

export type MatchCandidate = {
  request: SecondLifeRequest;
  eligible: boolean;
  reasons: MatchCandidateReason[];
  pricing: MatchPricing | null;
};

export type SecondLifeMatchSuccess = {
  ok: true;
  metadata: LifecyclePricingMetadata;
  candidates: MatchCandidate[];
  matches: Array<MatchCandidate & { pricing: MatchPricing }>;
};

export type SecondLifeMatchFailure =
  | { ok: false; reason: 'asset_not_available'; status: Asset['status'] }
  | { ok: false; reason: 'invalid_lifecycle_dates' }
  | { ok: false; reason: 'original_price_not_found' };

export type SecondLifeMatchResult = SecondLifeMatchSuccess | SecondLifeMatchFailure;

function assertDate(value: string, name: string): void {
  if (!isoDateSchema.safeParse(value).success) {
    throw new RangeError(`${name} must be a valid ISO date, got "${value}"`);
  }
}

function firstPriceListFor(priceLists: readonly PriceList[], assetId: string) {
  const sorted = [...priceLists].sort((left, right) =>
    left.valid_from.localeCompare(right.valid_from)
  );
  const first = sorted[0];
  const priceCents = first?.prices[assetId];
  if (!first || priceCents === undefined) return null;
  return { priceCents, version: first.version };
}

function lifecycleMetadataFor(
  asset: Asset,
  priceLists: readonly PriceList[]
): LifecyclePricingMetadata | null {
  const originalPrice =
    asset.original_list_price_cents === undefined
      ? firstPriceListFor(priceLists, asset.id)
      : { priceCents: asset.original_list_price_cents, version: null };
  if (!originalPrice) return null;

  return {
    firstLeasedOn: asset.first_leased_on ?? `${asset.model_year}-01-01`,
    originalListPriceCents: originalPrice.priceCents,
    source:
      asset.first_leased_on !== undefined && asset.original_list_price_cents !== undefined
        ? 'stored'
        : 'demo_fallback',
    originalPriceListVersion: originalPrice.version,
  };
}

function monthNumber(date: string): number {
  return Number(date.slice(0, 4)) * 12 + Number(date.slice(5, 7));
}

function wholeMonthsBetween(start: string, end: string): number {
  const monthDifference = monthNumber(end) - monthNumber(start);
  return monthDifference - (end.slice(8, 10) < start.slice(8, 10) ? 1 : 0);
}

function reasonForPricing(result: LeasePriceResult): MatchCandidateReason | null {
  if (result.ok) return null;
  switch (result.reason) {
    case 'unknown_term':
      return 'term_not_supported';
    case 'below_minimum':
      return 'price_below_minimum';
    case 'above_maximum':
      return 'price_above_maximum';
    case 'down_payment_exceeds_list_price':
      return 'price_below_minimum';
  }
}

function pricingFor(
  asset: Asset,
  request: SecondLifeRequest,
  availableOn: string,
  metadata: LifecyclePricingMetadata,
  curves: ResidualCurves,
  coefficientTable: CoefficientTable
): { pricing: MatchPricing | null; reason: MatchCandidateReason | null } {
  const residual: ResidualValueResult = residualValueFor({
    originalListPriceCents: metadata.originalListPriceCents,
    category: asset.category,
    condition: asset.condition,
    usageValue: asset.usage.value,
    ageMonths: wholeMonthsBetween(metadata.firstLeasedOn, availableOn),
    curves,
  });
  if (!residual.ok) return { pricing: null, reason: 'price_above_maximum' };

  const leasePrice = leasePriceFor(
    coefficientTable,
    residual.marketValueCents,
    0,
    request.preferred_term_months
  );
  const pricingReason = reasonForPricing(leasePrice);
  if (pricingReason || !leasePrice.ok) return { pricing: null, reason: pricingReason };
  if (leasePrice.monthlyNetRentCents > request.max_monthly_net_rent_cents) {
    return { pricing: null, reason: 'rent_over_budget' };
  }

  return {
    pricing: {
      marketValueCents: residual.marketValueCents,
      originalListPriceCents: metadata.originalListPriceCents,
      originalPriceListVersion: metadata.originalPriceListVersion,
      ageMonths: wholeMonthsBetween(metadata.firstLeasedOn, availableOn),
      curvePercent: residual.curvePercent,
      conditionMultiplier: residual.conditionMultiplier,
      usageAdjustmentPercent: residual.usageAdjustmentPercent,
      termMonths: leasePrice.termMonths,
      coefficientBand: leasePrice.band.band,
      monthlyNetRentCents: leasePrice.monthlyNetRentCents,
      totalCostWithBuyoutCents: leasePrice.totalCostWithBuyoutCents,
    },
    reason: null,
  };
}

function candidateFor(
  asset: Asset,
  request: SecondLifeRequest,
  availableOn: string,
  metadata: LifecyclePricingMetadata,
  curves: ResidualCurves,
  coefficientTable: CoefficientTable
): MatchCandidate {
  const reasons: MatchCandidateReason[] = [];
  if (asset.category !== request.category) reasons.push('category_mismatch');
  if (conditionRank[asset.condition] < conditionRank[request.min_condition]) {
    reasons.push('condition_below_minimum');
  }
  if (availableOn > request.needed_by) reasons.push('needed_by_expired');

  const priced =
    reasons.length === 0
      ? pricingFor(asset, request, availableOn, metadata, curves, coefficientTable)
      : { pricing: null, reason: null };
  if (priced.reason && !reasons.includes(priced.reason)) reasons.push(priced.reason);

  return {
    request,
    eligible: reasons.length === 0 && priced.pricing !== null,
    reasons,
    pricing: priced.pricing,
  };
}

function compareCandidates(left: MatchCandidate, right: MatchCandidate): number {
  const deadline = left.request.needed_by.localeCompare(right.request.needed_by);
  if (deadline !== 0) return deadline;

  const strictness =
    conditionRank[right.request.min_condition] - conditionRank[left.request.min_condition];
  if (strictness !== 0) return strictness;
  return left.request.id.localeCompare(right.request.id);
}

/** Calculates explainable, deterministic second-life matches without I/O or clock access. */
export function secondLifeMatchesFor(
  asset: Asset,
  demand: readonly SecondLifeRequest[],
  priceLists: readonly PriceList[],
  curves: ResidualCurves,
  coefficientTable: CoefficientTable,
  availableOn: string
): SecondLifeMatchResult {
  assertDate(availableOn, 'availableOn');
  if (asset.status !== 'available') {
    return { ok: false, reason: 'asset_not_available', status: asset.status };
  }

  const metadata = lifecycleMetadataFor(asset, priceLists);
  if (!metadata) return { ok: false, reason: 'original_price_not_found' };
  assertDate(metadata.firstLeasedOn, 'firstLeasedOn');
  if (metadata.firstLeasedOn > availableOn) {
    return { ok: false, reason: 'invalid_lifecycle_dates' };
  }

  const candidates = demand
    .map((request) => candidateFor(asset, request, availableOn, metadata, curves, coefficientTable))
    .sort((left, right) => {
      if (left.eligible !== right.eligible) return left.eligible ? -1 : 1;
      return compareCandidates(left, right);
    });
  const matches = candidates.filter(
    (candidate): candidate is MatchCandidate & { pricing: MatchPricing } =>
      candidate.eligible && candidate.pricing !== null
  );

  return { ok: true, metadata, candidates, matches };
}
