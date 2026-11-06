import type { Asset, Co2Factors, PriceList, ResidualCurves } from '@/data/schemas';
import { isoDateSchema } from '@/data/schemas';
import { listPriceOn } from '../pricing/price-list';
import { residualValueFor } from './residual-value';

export type CircularImpactFailureReason =
  | 'co2_factor_not_found'
  | 'new_price_not_found'
  | 'original_price_not_found'
  | 'invalid_lifecycle_dates';

export type CircularImpactFailure = {
  ok: false;
  reason: CircularImpactFailureReason;
};

export type CircularImpactLife = {
  lifeNumber: number;
  co2SavedGrams: number;
};

export type CircularImpact = {
  assetId: string;
  asOf: string;
  totalLives: number;
  reuseLives: number;
  co2: {
    manufacturingNewGrams: number;
    refurbishmentGramsPerReuseLife: number;
    avoidedManufacturingGramsPerReuseLife: number;
    savedGrams: number;
    savedByLife: CircularImpactLife[];
  };
  money: {
    originalListPriceCents: number;
    newListPriceCents: number;
    residualMarketValueCents: number;
    indicativeSavingsCents: number;
    ageMonths: number;
    conditionMultiplier: number;
    usageAdjustmentPercent: number;
  };
  explanation: {
    co2: string;
    money: string;
  };
};

export type CircularImpactResult = { ok: true; impact: CircularImpact } | CircularImpactFailure;

export type FleetCircularImpact = {
  asOf: string;
  items: CircularImpact[];
  excluded: Array<{ assetId: string; reason: CircularImpactFailureReason }>;
  totals: {
    assetCount: number;
    reuseLives: number;
    co2SavedGrams: number;
    indicativeSavingsCents: number;
  };
};

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
  return priceCents;
}

function monthNumber(date: string): number {
  return Number(date.slice(0, 4)) * 12 + Number(date.slice(5, 7));
}

function wholeMonthsBetween(start: string, end: string): number {
  const monthDifference = monthNumber(end) - monthNumber(start);
  return monthDifference - (end.slice(8, 10) < start.slice(8, 10) ? 1 : 0);
}

function co2For(
  asset: Asset,
  factors: Co2Factors
): {
  manufacturingNewGrams: number;
  refurbishmentGramsPerReuseLife: number;
  avoidedManufacturingGramsPerReuseLife: number;
} | null {
  const manufacturingNewKg = factors.manufacturing_new_kg[asset.category];
  if (manufacturingNewKg === undefined) return null;

  // Round to grams once, then keep all life totals as integer grams. Subtracting the
  // refurbishment footprint from the manufacturing footprint keeps the components additive.
  const manufacturingNewGrams = Math.round(manufacturingNewKg * 1000);
  const refurbishmentGramsPerReuseLife = Math.round(
    manufacturingNewGrams * factors.refurbishment_share_of_new
  );
  return {
    manufacturingNewGrams,
    refurbishmentGramsPerReuseLife,
    avoidedManufacturingGramsPerReuseLife: manufacturingNewGrams - refurbishmentGramsPerReuseLife,
  };
}

/** Calculates the explainable circular impact of one physical asset. */
export function circularImpactFor(
  asset: Asset,
  priceLists: readonly PriceList[],
  residualCurves: ResidualCurves,
  factors: Co2Factors,
  asOf: string
): CircularImpactResult {
  assertDate(asOf, 'asOf');

  const co2 = co2For(asset, factors);
  if (!co2) return { ok: false, reason: 'co2_factor_not_found' };

  const newPrice = listPriceOn(priceLists, asset.id, asOf);
  if (!newPrice.ok) return { ok: false, reason: 'new_price_not_found' };

  const originalListPriceCents =
    asset.original_list_price_cents ?? firstPriceListFor(priceLists, asset.id);
  if (originalListPriceCents === null || originalListPriceCents === undefined) {
    return { ok: false, reason: 'original_price_not_found' };
  }

  const firstLeasedOn = asset.first_leased_on ?? `${asset.model_year}-01-01`;
  assertDate(firstLeasedOn, 'firstLeasedOn');
  if (firstLeasedOn > asOf) return { ok: false, reason: 'invalid_lifecycle_dates' };

  const ageMonths = wholeMonthsBetween(firstLeasedOn, asOf);
  const residual = residualValueFor({
    originalListPriceCents,
    category: asset.category,
    condition: asset.condition,
    usageValue: asset.usage.value,
    ageMonths,
    curves: residualCurves,
  });
  if (!residual.ok) return { ok: false, reason: 'original_price_not_found' };

  const reuseLives = asset.previous_lives;
  const savedByLife = Array.from({ length: reuseLives }, (_, index) => ({
    lifeNumber: index + 2,
    co2SavedGrams: co2.avoidedManufacturingGramsPerReuseLife,
  }));
  const savedGrams = savedByLife.reduce((total, life) => total + life.co2SavedGrams, 0);
  const indicativeSavingsCents =
    reuseLives === 0 ? 0 : Math.max(0, newPrice.priceCents - residual.marketValueCents);

  return {
    ok: true,
    impact: {
      assetId: asset.id,
      asOf,
      totalLives: reuseLives + 1,
      reuseLives,
      co2: {
        ...co2,
        savedGrams,
        savedByLife,
      },
      money: {
        originalListPriceCents,
        newListPriceCents: newPrice.priceCents,
        residualMarketValueCents: residual.marketValueCents,
        indicativeSavingsCents,
        ageMonths,
        conditionMultiplier: residual.conditionMultiplier,
        usageAdjustmentPercent: residual.usageAdjustmentPercent,
      },
      explanation: {
        co2: 'Each completed reuse avoids one new manufacture after the refurbishment footprint.',
        money:
          'Indicative saving compares the current new net list price with this asset’s residual market value; it is not historical revenue.',
      },
    },
  };
}

/** Aggregates item results without allowing one invalid asset to hide the rest of the fleet. */
export function fleetCircularImpactFor(
  assets: readonly Asset[],
  priceLists: readonly PriceList[],
  residualCurves: ResidualCurves,
  factors: Co2Factors,
  asOf: string
): FleetCircularImpact {
  assertDate(asOf, 'asOf');

  const items: CircularImpact[] = [];
  const excluded: FleetCircularImpact['excluded'] = [];
  for (const asset of assets) {
    const result = circularImpactFor(asset, priceLists, residualCurves, factors, asOf);
    if (!result.ok) {
      excluded.push({ assetId: asset.id, reason: result.reason });
      continue;
    }
    items.push(result.impact);
  }

  return {
    asOf,
    items,
    excluded,
    totals: {
      assetCount: items.length,
      reuseLives: items.reduce((total, item) => total + item.reuseLives, 0),
      co2SavedGrams: items.reduce((total, item) => total + item.co2.savedGrams, 0),
      indicativeSavingsCents: items.reduce(
        (total, item) => total + item.money.indicativeSavingsCents,
        0
      ),
    },
  };
}
