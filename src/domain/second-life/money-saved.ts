// The money a second or third life saves (smart problem 7, decision D80). A later life stands in
// for a new item, so it is credited with the share of a new item's price it used and charged
// with the money actually spent getting it ready:
//   new net list price × counted months ÷ design life months − refurbishment cost of that life,
// never below zero. The months counted are the CO2's (D15, co2.ts): none for the first life (the
// item was bought new for it) and at most what is left of the design life, so an almost worn-out
// item saves little and a worn-out one nothing, while its refurbishment still costs what it
// costs. Every figure is money from the data pack: the price lists and refurbishment-costs.json.
//
// The new price is the item's net list price on the day asked about (the price list in force,
// the same one the catalogue shows), so the saving is in today's money and moves when a new list
// starts. The refurbishment cost of a life is what the return assessment spent before it (the
// `refurbished` event's `costCents`); a life with no such record (the data pack's past lives)
// is charged the steps refurbishment-costs.json does every time (`when: "always"`), the least
// any relisting costs.
//
// Rounding (D1): integer arithmetic on cents, then one division, half up to the cent. A life's
// exact saving is floored at zero before anything is added, so a life that saved nothing never
// takes away from another; an item's total is rounded once from the exact sum of its lives, and
// a category's row once from the exact sum of its items; the fleet total is the sum of the rows,
// so the breakdown on a page always adds up.
import { z } from 'zod';
import type { AssetCategory, RefurbishmentCosts } from '@/data/schemas';
import type { PassportEvent } from '../passport';
import { roundHalfUpDivBig } from '../money-math';
import { parseWhenRule } from '../refurbishment/plan';
import { countedMonths, type Co2Method, type LifeInput } from './co2';

export type MoneyLifeInput = LifeInput & {
  /** The item's net list price as new on the day, in cents. */
  newPriceCents: number;
  /** What getting the item ready for this life cost, in cents; 0 for the first life. */
  refurbishmentCents: number;
};

const assertWholeNonNegative = (name: string, value: number) => {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a whole number of at least 0, got ${value}`);
  }
};

/** The steps every relisting of the category pays (`when: "always"`), in cents. */
export function mandatoryRefurbishmentCents(
  costs: RefurbishmentCosts,
  category: AssetCategory
): number {
  return costs[category].fixed
    .filter((step) => parseWhenRule(step.when).kind === 'always')
    .reduce((sum, step) => sum + step.cost_cents, 0);
}

const refurbishedDetailsSchema = z.object({ costCents: z.number().int().nonnegative() });

/**
 * What each life's refurbishment cost, in passport order: 0 for the first life; for a later one,
 * the `costCents` of the `refurbished` events in the gap before it, or `fallbackCents` (the
 * category's mandatory steps) when that gap holds none, as for the data pack's past lives.
 */
export function refurbishmentByLife(
  lives: readonly { between: readonly PassportEvent[] }[],
  fallbackCents: number
): number[] {
  return lives.map((_, index) => {
    if (index === 0) return 0;
    const spent = lives[index - 1]!.between.filter((event) => event.kind === 'refurbished').map(
      (event) => refurbishedDetailsSchema.parse(event.details).costCents
    );
    return spent.length === 0 ? fallbackCents : spent.reduce((sum, cents) => sum + cents, 0);
  });
}

/** One life's exact saving in cents × design life months, floored at zero. */
function savedNumerator(method: Co2Method, life: MoneyLifeInput): bigint {
  assertWholeNonNegative('newPriceCents', life.newPriceCents);
  assertWholeNonNegative('refurbishmentCents', life.refurbishmentCents);
  const counted = countedMonths(method, life);
  if (counted === 0) return 0n;
  const designLife = BigInt(method.designLifeMonths[life.category]);
  const numerator =
    BigInt(life.newPriceCents) * BigInt(counted) - BigInt(life.refurbishmentCents) * designLife;
  return numerator > 0n ? numerator : 0n;
}

const denominator = (method: Co2Method, category: AssetCategory) =>
  BigInt(method.designLifeMonths[category]);

/** Cents one life saved, rounded half up; 0 for the first life, past the design life, or at a loss. */
export function moneySavedByLife(method: Co2Method, life: MoneyLifeInput): number {
  return Number(
    roundHalfUpDivBig(savedNumerator(method, life), denominator(method, life.category))
  );
}

/** One item: its category, its price as new on the day (null when no list prices it), its lives. */
export type AssetMoneyLives = {
  category: AssetCategory;
  newPriceCents: number | null;
  lives: readonly { months: number; refurbishmentCents: number }[];
};

export type AssetMoney = {
  /** Per life, each rounded (for display; the total is not their sum). */
  perLifeCents: number[];
  /** The exact sum of the lives, rounded once. */
  totalCents: number;
};

function assetNumerators(method: Co2Method, asset: AssetMoneyLives): bigint[] {
  let monthsUsedBefore = 0;
  return asset.lives.map((life, lifeIndex) => {
    const numerator =
      asset.newPriceCents === null
        ? 0n
        : savedNumerator(method, {
            category: asset.category,
            lifeIndex,
            months: life.months,
            monthsUsedBefore,
            newPriceCents: asset.newPriceCents,
            refurbishmentCents: life.refurbishmentCents,
          });
    monthsUsedBefore += life.months;
    return numerator;
  });
}

/** The money an item's later lives saved; each life uses up the design life in turn. */
export function moneySavedForAsset(method: Co2Method, asset: AssetMoneyLives): AssetMoney {
  const den = denominator(method, asset.category);
  const numerators = assetNumerators(method, asset);
  const total = numerators.reduce((sum, value) => sum + value, 0n);
  return {
    perLifeCents: numerators.map((value) => Number(roundHalfUpDivBig(value, den))),
    totalCents: Number(roundHalfUpDivBig(total, den)),
  };
}

export type FleetMoney = {
  /** Every category, in the order of `designLifeMonths`, even an empty one. */
  perCategory: { category: AssetCategory; cents: number }[];
  /** The sum of the category rows. */
  totalCents: number;
};

/** The money the whole fleet's later lives saved, per category and overall. */
export function fleetMoneySaved(method: Co2Method, assets: readonly AssetMoneyLives[]): FleetMoney {
  const categories = Object.keys(method.designLifeMonths) as AssetCategory[];
  const perCategory = categories.map((category) => {
    let numerator = 0n;
    for (const asset of assets) {
      if (asset.category !== category) continue;
      for (const value of assetNumerators(method, asset)) numerator += value;
    }
    return {
      category,
      cents: Number(roundHalfUpDivBig(numerator, denominator(method, category))),
    };
  });
  return {
    perCategory,
    totalCents: perCategory.reduce((sum, row) => sum + row.cents, 0),
  };
}
