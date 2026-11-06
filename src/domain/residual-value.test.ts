import { beforeAll, describe, expect, it } from 'vitest';
import { loadResidualCurves } from '@/data/load';
import type { ResidualCurves } from '@/data/schemas';
import { residualValueFor } from './residual-value';

let curves: ResidualCurves;

beforeAll(async () => {
  curves = await loadResidualCurves();
});

describe('residualValueFor', () => {
  it('interpolates the residual curve and applies condition', () => {
    expect(
      residualValueFor({
        originalListPriceCents: 100_000,
        category: 'e_bike',
        condition: 'good',
        usageValue: 0,
        ageMonths: 9,
        curves,
      })
    ).toEqual({
      ok: true,
      marketValueCents: 64_600,
      curvePercent: 76,
      conditionMultiplier: 0.85,
      usageAdjustmentPercent: 0,
    });
  });

  it('holds the last curve point and caps usage loss', () => {
    expect(
      residualValueFor({
        originalListPriceCents: 100_000,
        category: 'laptop',
        condition: 'fair',
        usageValue: 10_000,
        ageMonths: 120,
        curves,
      })
    ).toMatchObject({
      ok: true,
      curvePercent: 12,
      conditionMultiplier: 0.65,
      usageAdjustmentPercent: -15,
      marketValueCents: 6_630,
    });
  });
});
