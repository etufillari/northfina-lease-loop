// Circular impact (Smart Problem 7): the CO₂ and money that second and third lives save.
//
// Method (data/co2-factors.json, which is fictional):
// - Every life after the first is a "reuse life": someone leased this item instead of a new
//   one being made. Lives started = the lives the item has finished, plus the one running now.
// - A reuse life avoids making a new item, minus the refurbishment it needed:
//   manufacturing_new_kg × (1 − refurbishment_share_of_new).
// - That is only fair for an item in good shape. An almost worn-out item replaces only part of
//   a new one's life, so the saving is scaled by the life it has left: the same age curve ×
//   condition × usage factors that price it (src/domain/second-life.ts). A fair, old, heavily
//   used e-bike gets maybe a third of the credit a nearly new one gets.
// - We only know the item as it is today, so every reuse life is scaled by today's life left.
//   Earlier lives were in better shape, so this under-counts rather than over-claims.
// - Money: a reuse-life customer pays for a used item, not a new one. The saving is the new
//   price × (1 − life left), the same share, so CO₂ and money are measured the same way.
// - E-bikes also replace car trips. km × e_bike_avoided_car_km_kg_per_km is shown separately:
//   it would happen with a new bike too, so it isn't a saving of reuse.
import type { AssetCategory, AssetCondition, Co2Factors, ResidualCurves } from '@/data/schemas';
import { multiplyCents } from './money';
import { residualPercent, usagePercent } from './second-life';

/** The share (0..1) of a new item's life this one still has: age × condition × usage. */
export function lifeLeftShare(
  curves: ResidualCurves,
  input: { category: AssetCategory; ageMonths: number; condition: AssetCondition; usage: number }
): number {
  const curve = curves.curves[input.category] ?? [];
  const age = curve.length > 0 ? residualPercent(curve, input.ageMonths) / 100 : 0;
  const condition = curves.condition_multiplier[input.condition] ?? 0;
  const usage = 1 + usagePercent(curves, input.category, input.usage) / 100;
  return Math.min(1, Math.max(0, age * condition * usage));
}

export type Co2Input = {
  category: AssetCategory;
  /** Lives the item has finished (the data pack's previous_lives plus our own). */
  previousLives: number;
  /** Whether a lease is running now (that life has started but isn't counted yet). */
  leasedNow: boolean;
  /** From lifeLeftShare. */
  lifeLeft: number;
  /** The net price of the item when new, in cents (null if unknown). */
  newPriceCents: number | null;
  /** km ridden, for e-bikes; null for other items. */
  km: number | null;
};

export type Co2Impact = {
  livesStarted: number;
  reuseLives: number;
  /** kg CO₂e to make a new one. */
  newItemKg: number;
  /** kg avoided by one reuse life of an item in perfect shape. */
  perReuseLifeKg: number;
  /** kg avoided by this item's reuse lives, scaled by life left. Whole kg. */
  reuseSavedKg: number;
  /** Money a reuse-life customer saved compared with a new one, net cents. */
  moneySavedCents: number;
  /** kg avoided by riding instead of driving (e-bikes only). Whole kg. */
  ridingSavedKg: number;
};

export function co2Impact(factors: Co2Factors, input: Co2Input): Co2Impact {
  const livesStarted = input.previousLives + (input.leasedNow ? 1 : 0);
  const reuseLives = Math.max(0, livesStarted - 1);
  const newItemKg = factors.manufacturing_new_kg[input.category] ?? 0;
  const perReuseLifeKg = newItemKg * (1 - factors.refurbishment_share_of_new);
  const perLifeMoney =
    input.newPriceCents === null ? 0 : multiplyCents(input.newPriceCents, 1 - input.lifeLeft);
  return {
    livesStarted,
    reuseLives,
    newItemKg,
    perReuseLifeKg,
    reuseSavedKg: Math.round(reuseLives * perReuseLifeKg * input.lifeLeft),
    moneySavedCents: reuseLives * perLifeMoney,
    ridingSavedKg:
      input.category === 'e_bike' && input.km !== null
        ? Math.round(input.km * factors.e_bike_avoided_car_km_kg_per_km)
        : 0,
  };
}

export type FleetImpact = {
  itemsReused: number;
  reuseLives: number;
  reuseSavedKg: number;
  moneySavedCents: number;
  ridingSavedKg: number;
};

/** The whole fleet's impact: the sum over every item. */
export function fleetImpact(items: readonly Co2Impact[]): FleetImpact {
  return items.reduce<FleetImpact>(
    (sum, item) => ({
      itemsReused: sum.itemsReused + (item.reuseLives > 0 ? 1 : 0),
      reuseLives: sum.reuseLives + item.reuseLives,
      reuseSavedKg: sum.reuseSavedKg + item.reuseSavedKg,
      moneySavedCents: sum.moneySavedCents + item.moneySavedCents,
      ridingSavedKg: sum.ridingSavedKg + item.ridingSavedKg,
    }),
    { itemsReused: 0, reuseLives: 0, reuseSavedKg: 0, moneySavedCents: 0, ridingSavedKg: 0 }
  );
}
