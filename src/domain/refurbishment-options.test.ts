import { beforeAll, describe, expect, it } from 'vitest';
import { loadAssets, loadRefurbishmentCosts, loadResidualCurves } from '@/data/load';
import type { Asset, RefurbishmentCosts, ResidualCurves } from '@/data/schemas';
import { refurbishmentPlan } from './lifecycle';
import { compareRefurbishmentPlans } from './refurbishment-options';

let asset: Asset;
let costs: RefurbishmentCosts;
let rules: ResidualCurves;
beforeAll(async () => {
  const [assets, loadedCosts, loadedRules] = await Promise.all([
    loadAssets(),
    loadRefurbishmentCosts(),
    loadResidualCurves(),
  ]);
  asset = assets.find((item) => item.id === 'ebike-007')!;
  costs = loadedCosts;
  rules = loadedRules;
});

function comparison(overrides: Partial<Parameters<typeof compareRefurbishmentPlans>[0]> = {}) {
  return compareRefurbishmentPlans({
    asset,
    costs,
    rules,
    ageMonths: 24,
    originalPriceCents: 389000,
    ...overrides,
  });
}

describe('refurbishment plan comparison', () => {
  it('compares mandatory work and successive upgrades for the worn returned bike', () => {
    const result = comparison();
    expect(result.options.map(({ condition }) => condition)).toEqual([
      'new',
      'like_new',
      'good',
      'fair',
    ]);
    expect(result.options.find(({ condition }) => condition === 'fair')).toMatchObject({
      requiresFairAcceptance: true,
      work: { ok: true, totalNetCents: 39500 },
      valuation: { ok: true, marketValueCents: 105186 },
      netRecoveryCents: 65686,
      economicallyViable: true,
    });
    expect(result.options.find(({ condition }) => condition === 'good')).toMatchObject({
      work: { ok: true, totalNetCents: 51500 },
      valuation: { ok: true, marketValueCents: 137550 },
      netRecoveryCents: 86050,
    });
    expect(result.options.find(({ condition }) => condition === 'like_new')).toMatchObject({
      work: { ok: true, totalNetCents: 59500 },
      valuation: { ok: true, marketValueCents: 153733 },
      netRecoveryCents: 94233,
    });
    expect(result.options.find(({ condition }) => condition === 'new')).toMatchObject({
      work: { ok: false, reason: 'unsupported_upgrade' },
      netRecoveryCents: null,
      economicallyViable: null,
    });
  });

  it('requires explicit fair acceptance and retains all mandatory work', () => {
    expect(refurbishmentPlan({ asset, costs, targetCondition: 'fair' })).toEqual({
      ok: false,
      reason: 'condition_too_low',
    });
    expect(
      refurbishmentPlan({ asset, costs, targetCondition: 'fair', acceptsFairCondition: true })
    ).toMatchObject({
      ok: true,
      totalNetCents: 39500,
      tasks: [{ id: 'battery_replacement' }, { id: 'safety_inspection' }],
    });
    expect(
      refurbishmentPlan({ asset, costs, targetCondition: 'poor', acceptsFairCondition: true })
    ).toEqual({
      ok: false,
      reason: 'condition_too_low',
    });
  });

  it('does not offer a downgrade or poor condition', () => {
    const options = comparison({ asset: { ...asset, condition: 'good' } }).options;
    expect(options.map(({ condition }) => condition)).toEqual(['new', 'like_new', 'good']);
  });

  it('includes every upgrade from poor to a conditionally acceptable fair item', () => {
    const option = comparison({ asset: { ...asset, condition: 'poor' } }).options.find(
      ({ condition }) => condition === 'fair'
    );
    expect(option).toMatchObject({
      work: {
        ok: true,
        totalNetCents: 54500,
        tasks: [
          { id: 'upgrade:poor->fair' },
          { id: 'battery_replacement' },
          { id: 'safety_inspection' },
        ],
      },
    });
  });

  it('does not call uneconomic work viable or hide a negative recovery', () => {
    const option = comparison({ originalPriceCents: 100 }).options.find(
      ({ condition }) => condition === 'fair'
    );
    expect(option).toMatchObject({
      valuation: { ok: true, marketValueCents: 27 },
      netRecoveryCents: -39473,
      economicallyViable: false,
    });
  });

  it('treats exact zero recovery as break-even', () => {
    const changed = structuredClone(costs);
    changed.e_bike.fixed = [{ id: 'inspection', cost_cents: 105186, when: 'always' }];
    expect(
      comparison({ costs: changed }).options.find(({ condition }) => condition === 'fair')
    ).toMatchObject({
      netRecoveryCents: 0,
      economicallyViable: true,
    });
  });

  it.each(['ageMonths', 'originalPriceCents'] as const)(
    'keeps %s unknown instead of inventing an offer',
    (field) => {
      const result = comparison({ [field]: null });
      expect(result.currentValue.ok).toBe(false);
      expect(
        result.options.every(
          (option) => option.netRecoveryCents === null && option.economicallyViable === null
        )
      ).toBe(true);
    }
  );

  it('keeps missing service evidence visible for farm machinery', () => {
    const result = comparison({
      asset: { ...asset, category: 'farm_machine', usage: { unit: 'engine_hours', value: 1501 } },
    });
    expect(result.options.every((option) => !option.work.ok)).toBe(true);
    expect(result.options.find(({ condition }) => condition === 'good')).toMatchObject({
      work: { ok: false, reason: 'missing_service_history' },
      netRecoveryCents: null,
    });
  });

  it('uses recorded component maintenance without erasing cumulative wear', () => {
    const result = comparison({ maintenance: { batteryReplacementAtUsage: 18400 } });
    expect(result.options.find(({ condition }) => condition === 'fair')).toMatchObject({
      work: { ok: true, totalNetCents: 4500 },
      valuation: { ok: true, usageSteps: 18, marketValueCents: 105186 },
    });
  });

  it('does not mutate assets, rules or costs or mark repairs completed', () => {
    const before = structuredClone({ asset, rules, costs });
    comparison();
    expect({ asset, rules, costs }).toEqual(before);
    expect(asset.condition).toBe('fair');
    expect(asset.usage.value).toBe(18400);
  });
});
