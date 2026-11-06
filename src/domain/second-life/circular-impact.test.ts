import fc from 'fast-check';
import { beforeAll, describe, expect, it } from 'vitest';
import { loadAssets, loadCo2Factors, loadPriceLists, loadResidualCurves } from '@/data/load';
import type { Asset, Co2Factors, PriceList, ResidualCurves } from '@/data/schemas';
import { circularImpactFor, fleetCircularImpactFor } from './circular-impact';

let assets: Asset[];
let factors: Co2Factors;
let priceLists: PriceList[];
let residualCurves: ResidualCurves;

beforeAll(async () => {
  [assets, factors, priceLists, residualCurves] = await Promise.all([
    loadAssets(),
    loadCo2Factors(),
    loadPriceLists(),
    loadResidualCurves(),
  ]);
});

describe('circularImpactFor', () => {
  it('calculates the second and third life savings as integer grams', () => {
    const asset = assets.find((candidate) => candidate.id === 'ebike-008');
    if (!asset) throw new Error('test asset not found');

    const result = circularImpactFor(asset, priceLists, residualCurves, factors, '2026-11-06');

    expect(result).toMatchObject({
      ok: true,
      impact: {
        reuseLives: 2,
        totalLives: 3,
        co2: {
          manufacturingNewGrams: 165_000,
          refurbishmentGramsPerReuseLife: 19_800,
          avoidedManufacturingGramsPerReuseLife: 145_200,
          savedGrams: 290_400,
          savedByLife: [
            { lifeNumber: 2, co2SavedGrams: 145_200 },
            { lifeNumber: 3, co2SavedGrams: 145_200 },
          ],
        },
      },
    });
    if (!result.ok) return;
    expect(Number.isInteger(result.impact.money.indicativeSavingsCents)).toBe(true);
  });

  it('gives new assets no reuse money saving', () => {
    const asset = assets.find((candidate) => candidate.id === 'ebike-003');
    if (!asset) throw new Error('test asset not found');

    const result = circularImpactFor(asset, priceLists, residualCurves, factors, '2026-11-06');

    expect(result).toMatchObject({
      ok: true,
      impact: { reuseLives: 0, co2: { savedGrams: 0 }, money: { indicativeSavingsCents: 0 } },
    });
  });

  it('keeps CO2 credit constant while condition changes the residual price gap', () => {
    const asset = assets.find((candidate) => candidate.id === 'ebike-008');
    if (!asset) throw new Error('test asset not found');

    const good = circularImpactFor(asset, priceLists, residualCurves, factors, '2026-11-06');
    const fair = circularImpactFor(
      { ...asset, condition: 'fair' },
      priceLists,
      residualCurves,
      factors,
      '2026-11-06'
    );

    expect(good.ok && fair.ok).toBe(true);
    if (!good.ok || !fair.ok) return;
    expect(fair.impact.co2.savedGrams).toBe(good.impact.co2.savedGrams);
    expect(fair.impact.money.residualMarketValueCents).toBeLessThan(
      good.impact.money.residualMarketValueCents
    );
    expect(fair.impact.money.indicativeSavingsCents).toBeGreaterThan(
      good.impact.money.indicativeSavingsCents
    );
  });

  it('rejects a first lease date after the calculation date', () => {
    const asset = assets.find((candidate) => candidate.id === 'ebike-008');
    if (!asset) throw new Error('test asset not found');

    expect(
      circularImpactFor(
        { ...asset, first_leased_on: '2027-01-01', original_list_price_cents: 549_000 },
        priceLists,
        residualCurves,
        factors,
        '2026-11-06'
      )
    ).toEqual({ ok: false, reason: 'invalid_lifecycle_dates' });
  });

  it('preserves life totals for random reuse counts', () => {
    const asset = assets.find((candidate) => candidate.id === 'ebike-008');
    if (!asset) throw new Error('test asset not found');

    fc.assert(
      fc.property(fc.integer({ min: 0, max: 20 }), (previousLives) => {
        const result = circularImpactFor(
          { ...asset, previous_lives: previousLives },
          priceLists,
          residualCurves,
          factors,
          '2026-11-06'
        );
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.impact.co2.savedByLife).toHaveLength(previousLives);
        expect(result.impact.co2.savedGrams).toBe(
          previousLives * result.impact.co2.avoidedManufacturingGramsPerReuseLife
        );
        expect(result.impact.totalLives).toBe(previousLives + 1);
      })
    );
  });
});

describe('fleetCircularImpactFor', () => {
  it('aggregates item totals exactly', () => {
    const result = fleetCircularImpactFor(
      assets,
      priceLists,
      residualCurves,
      factors,
      '2026-11-06'
    );

    expect(result.excluded).toEqual([]);
    expect(result.totals.assetCount).toBe(assets.length);
    expect(result.totals.co2SavedGrams).toBe(
      result.items.reduce((total, item) => total + item.co2.savedGrams, 0)
    );
    expect(result.totals.indicativeSavingsCents).toBe(
      result.items.reduce((total, item) => total + item.money.indicativeSavingsCents, 0)
    );
  });
});
