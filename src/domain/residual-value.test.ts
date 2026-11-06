import { beforeAll, describe, expect, it } from 'vitest';
import { loadResidualCurves } from '../data/load';
import { calculateResidualValue } from './residual-value';
import type { ResidualValueInput } from './residual-value';

describe('calculateResidualValue', () => {
  let curves: Awaited<ReturnType<typeof loadResidualCurves>>;

  beforeAll(async () => {
    curves = await loadResidualCurves();
  });

  const baseInput = (): ResidualValueInput => ({
    category: 'e_bike',
    originalPriceCents: 549000,
    modelYear: 2023,
    valuationDate: '2026-11-06',
    condition: 'fair',
    usage: {
      unit: 'km',
      value: 18400,
    },
    curves,
  });

  it('calculates the market value with the original usage', () => {
    const result = calculateResidualValue(baseInput());

    expect(result.ok).toBe(true);

    if (!result.ok) return;

    expect(result.ageMonths).toBe(46);
    expect(result.ageMultiplier).toBeCloseTo(0.325);
    expect(result.conditionMultiplier).toBe(0.65);
    expect(result.usageMultiplier).toBeCloseTo(0.8);
    expect(result.marketValueCents).toBe(92781);
  });

  it('calculates the market value after battery replacement resets usage', () => {
    const input = baseInput();
    input.usage.value = 0;

    const result = calculateResidualValue(input);

    expect(result.ok).toBe(true);

    if (!result.ok) return;

    expect(result.usageMultiplier).toBe(1);
    expect(result.marketValueCents).toBe(115976);
  });

  it('calculates a higher value when condition improves to good', () => {
    const input: ResidualValueInput = {
      ...baseInput(),
      condition: 'good',
      usage: {
        unit: 'km',
        value: 0,
      },
    };

    const result = calculateResidualValue(input);

    expect(result.ok).toBe(true);

    if (!result.ok) return;

    expect(result.conditionMultiplier).toBe(0.85);
    expect(result.marketValueCents).toBe(151661);
  });

  it('rejects an invalid calendar date', () => {
    const input = baseInput();
    input.valuationDate = '2026-02-31';

    const result = calculateResidualValue(input);

    expect(result).toEqual({
      ok: false,
      reason: 'invalid_date',
    });
  });

  it('rejects an incorrectly formatted date', () => {
    const input = baseInput();
    input.valuationDate = '06-11-2026';

    const result = calculateResidualValue(input);

    expect(result).toEqual({
      ok: false,
      reason: 'invalid_date',
    });
  });

  it('rejects usage with the wrong unit for the asset category', () => {
    const input: ResidualValueInput = {
      ...baseInput(),
      usage: {
        unit: 'battery_cycles',
        value: 100,
      },
    };

    const result = calculateResidualValue(input);

    expect(result).toEqual({
      ok: false,
      reason: 'usage_unit_mismatch',
    });
  });

  it('rejects a negative original price', () => {
    const input = baseInput();
    input.originalPriceCents = -100;

    const result = calculateResidualValue(input);

    expect(result).toEqual({
      ok: false,
      reason: 'invalid_input',
    });
  });

  it('rejects negative usage', () => {
    const input = baseInput();
    input.usage.value = -100;

    const result = calculateResidualValue(input);

    expect(result).toEqual({
      ok: false,
      reason: 'invalid_input',
    });
  });
});
