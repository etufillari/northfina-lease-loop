import { describe, expect, it } from 'vitest';
import { loadAssets, loadRefurbishmentCosts } from '@/data/load';
import { planRefurbishment, requiredWorkComplete } from './refurbishment';
const assets = await loadAssets();
const costs = await loadRefurbishmentCosts();
const bike = assets.find((a) => a.id === 'ebike-007');
if (!bike) throw new Error('fixture missing');
describe('mandatory refurbishment', () => {
  it('requires battery and safety work for card9 and records reset evidence', () => {
    const plan = planRefurbishment(bike, costs);
    expect(plan.costCents).toBe(51500);
    expect(plan.resultingCondition).toBe('good');
    expect(plan.resultingUsage).toBe(0);
    expect(plan.steps.map((s) => s.id)).toEqual([
      'fair->good',
      'battery_replacement',
      'safety_inspection',
    ]);
    expect(requiredWorkComplete(plan, ['fair->good'])).toBe(false);
    const ids = plan.steps.map((s) => s.id);
    expect(requiredWorkComplete(plan, ids)).toBe(true);
    expect(requiredWorkComplete(plan, [...ids, ids[0] ?? ''])).toBe(false);
    expect(requiredWorkComplete(plan, [...ids, 'invented'])).toBe(false);
  });
  it('always requires certified data wipe and respects usage thresholds', () => {
    const laptop = assets.find((a) => a.category === 'laptop');
    if (!laptop) throw new Error('fixture');
    expect(
      planRefurbishment(
        { ...laptop, usage: { unit: 'battery_cycles', value: 499 } },
        costs
      ).steps.map((s) => s.id)
    ).toContain('certified_data_wipe');
    expect(
      planRefurbishment(
        { ...laptop, usage: { unit: 'battery_cycles', value: 500 } },
        costs
      ).steps.map((s) => s.id)
    ).toContain('battery_replacement');
    expect(
      planRefurbishment({ ...bike, usage: { unit: 'km', value: 14999 } }, costs).steps.map(
        (s) => s.id
      )
    ).not.toContain('battery_replacement');
  });
  it('charges every started service interval and rejects unsupported inputs', () => {
    const farm = assets.find((a) => a.category === 'farm_machine');
    if (!farm) throw new Error('fixture');
    const plan = planRefurbishment(
      { ...farm, condition: 'good', usage: { unit: 'engine_hours', value: 1001 } },
      costs
    );
    expect(plan.costCents).toBe(340000);
    expect(() =>
      planRefurbishment({ ...bike, usage: { unit: 'battery_cycles', value: 5 } }, costs)
    ).toThrow();
    expect(() => planRefurbishment({ ...bike, usage: { unit: 'km', value: -1 } }, costs)).toThrow();
    expect(() => planRefurbishment({ ...bike, condition: 'like_new' }, costs, 'new')).toThrow();
  });
});
