import { beforeAll, describe, expect, it } from 'vitest';
import { loadResidualCurves } from '@/data/load';
import type { ResidualCurves } from '@/data/schemas';
import { residualValue, type ResidualValueInput } from './residual-value';

let rules: ResidualCurves;
beforeAll(async () => {
  rules = await loadResidualCurves();
});

function input(overrides: Partial<ResidualValueInput> = {}): ResidualValueInput {
  return {
    asset: { category: 'e_bike', condition: 'good', usage: { unit: 'km', value: 18400 } },
    ageMonths: 24,
    originalPriceCents: 389000,
    rules,
    ...overrides,
  };
}

describe('residual valuation policy', () => {
  it('combines age, condition and capped wear from the real data pack', () => {
    // 389000 * 52/100 * 85/100 * 80/100 = 137550.4 cents.
    expect(residualValue(input())).toMatchObject({
      ok: true,
      marketValueCents: 137550,
      ageMonths: 24,
      originalPriceCents: 389000,
      conditionMultiplier: 0.85,
      usageSteps: 18,
      usageReductionPercent: 20,
      ageBracket: { from: [24, 52], to: [36, 40] },
    });
  });

  it.each([
    [0, 100000],
    [6, 82000],
    [9, 76000],
    [18, 61000],
    [60, 25000],
    [120, 25000],
  ])('interpolates age %s and holds the last value', (ageMonths, expected) => {
    expect(
      residualValue(
        input({
          ageMonths,
          originalPriceCents: 100000,
          asset: { category: 'e_bike', condition: 'new', usage: { unit: 'km', value: 0 } },
        })
      )
    ).toMatchObject({ ok: true, marketValueCents: expected });
  });

  it.each([
    [999, 0],
    [1000, 2],
    [9999, 18],
    [10000, 20],
    [999999, 20],
  ])('uses completed wear steps at %s km', (value, usageReductionPercent) => {
    expect(
      residualValue(
        input({
          asset: { category: 'e_bike', condition: 'fair', usage: { unit: 'km', value } },
        })
      )
    ).toMatchObject({ ok: true, usageReductionPercent });
  });

  it.each([
    ['laptop', 'battery_cycles', 100, 1.5, 39400],
    ['farm_machine', 'engine_hours', 500, 3, 71780],
  ] as const)(
    'uses %s wear units and decimal percentages',
    (category, unit, value, reduction, cents) => {
      expect(
        residualValue(
          input({
            originalPriceCents: 100000,
            asset: { category, condition: 'new', usage: { unit, value } },
          })
        )
      ).toMatchObject({ ok: true, usageReductionPercent: reduction, marketValueCents: cents });
    }
  );

  it('rounds only the final result, including half a cent upwards', () => {
    const custom = structuredClone(rules);
    custom.curves.e_bike = [
      [0, 100],
      [3, 50],
    ];
    // 2 * (250/3)% * 0.85 = 1.416... => 1; rounding age-only cents first gives 2.
    expect(
      residualValue(
        input({
          rules: custom,
          ageMonths: 1,
          originalPriceCents: 2,
          asset: { category: 'e_bike', condition: 'good', usage: { unit: 'km', value: 0 } },
        })
      )
    ).toMatchObject({ ok: true, marketValueCents: 1 });
    custom.curves.e_bike = [[0, 50]];
    expect(
      residualValue(
        input({
          rules: custom,
          ageMonths: 0,
          originalPriceCents: 1,
          asset: { category: 'e_bike', condition: 'new', usage: { unit: 'km', value: 0 } },
        })
      )
    ).toMatchObject({ ok: true, marketValueCents: 1 });
  });

  it('handles zero value and safe-integer limits without intermediate overflow', () => {
    expect(residualValue(input({ originalPriceCents: 0 }))).toMatchObject({
      ok: true,
      marketValueCents: 0,
    });
    expect(
      residualValue(
        input({
          ageMonths: 0,
          originalPriceCents: Number.MAX_SAFE_INTEGER,
          asset: { category: 'e_bike', condition: 'new', usage: { unit: 'km', value: 0 } },
        })
      )
    ).toMatchObject({ ok: true, marketValueCents: Number.MAX_SAFE_INTEGER });
  });

  it('requires actual age and first-lease price instead of inventing missing history', () => {
    expect(residualValue(input({ ageMonths: null }))).toEqual({ ok: false, reason: 'age_unknown' });
    expect(residualValue(input({ originalPriceCents: null }))).toEqual({
      ok: false,
      reason: 'original_price_unknown',
    });
  });

  it('rejects mismatched usage units and leaves all inputs untouched', () => {
    const value = input();
    const before = structuredClone(value);
    residualValue(value);
    expect(value).toEqual(before);
    expect(
      residualValue(
        input({
          asset: {
            category: 'e_bike',
            condition: 'good',
            usage: { unit: 'battery_cycles', value: 10 },
          },
        })
      )
    ).toEqual({ ok: false, reason: 'usage_unit_mismatch' });
  });

  it.each([-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])(
    'rejects invalid numeric input %s',
    (value) => {
      expect(() => residualValue(input({ ageMonths: value }))).toThrow(RangeError);
      expect(() => residualValue(input({ originalPriceCents: value }))).toThrow(RangeError);
      expect(() =>
        residualValue(
          input({
            asset: { category: 'e_bike', condition: 'good', usage: { unit: 'km', value } },
          })
        )
      ).toThrow(RangeError);
    }
  );

  it('holds the first point before a curve begins', () => {
    const custom = structuredClone(rules);
    custom.curves.e_bike = [[6, 80]];
    expect(residualValue(input({ rules: custom, ageMonths: 0 }))).toMatchObject({
      ok: true,
      marketValueCents: 211616,
    });
  });

  it.each(['empty', 'duplicate', 'negative', 'step', 'wear', 'cap', 'condition'] as const)(
    'rejects malformed %s rules',
    (kind) => {
      const custom = structuredClone(rules);
      if (kind === 'empty') custom.curves.e_bike = [];
      if (kind === 'duplicate')
        custom.curves.e_bike = [
          [0, 100],
          [0, 50],
        ];
      if (kind === 'negative') custom.curves.e_bike = [[0, -1]];
      if (kind === 'step') custom.usage_adjustment.e_bike.step = 0;
      if (kind === 'wear') custom.usage_adjustment.e_bike.percent_per_step = 2;
      if (kind === 'cap') custom.usage_adjustment.e_bike.max_total_percent = -101;
      if (kind === 'condition') custom.condition_multiplier.good = 1.1;
      expect(() => residualValue(input({ rules: custom }))).toThrow(RangeError);
    }
  );
});
