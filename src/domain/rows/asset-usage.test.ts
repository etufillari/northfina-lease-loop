import { describe, expect, it } from 'vitest';
import { assetsFileSchema } from '@/data/schemas';
import assetsJson from '../../../data/assets.json';
import { assetUsageSchema, usageUnitFor } from './asset-usage';

describe('usageUnitFor: what each category counts', () => {
  it('e-bikes count km, laptops battery cycles, farm machines engine hours', () => {
    expect(usageUnitFor('e_bike')).toBe('km');
    expect(usageUnitFor('laptop')).toBe('battery_cycles');
    expect(usageUnitFor('farm_machine')).toBe('engine_hours');
  });

  it('holds for every asset in the data pack', () => {
    for (const asset of assetsFileSchema.parse(assetsJson)) {
      expect(usageUnitFor(asset.category), asset.id).toBe(asset.usage.unit);
    }
  });
});

describe('assetUsageSchema: the usage written back on a return', () => {
  it('accepts 18 400 km on an e-bike (card 9)', () => {
    const usage = { category: 'e_bike', usage_unit: 'km', usage_value: 18400 };
    expect(assetUsageSchema.parse(usage)).toEqual(usage);
  });

  it('refuses a unit of another category, and a negative or fractional count', () => {
    const bike = { category: 'e_bike', usage_unit: 'engine_hours', usage_value: 10 };
    expect(assetUsageSchema.safeParse(bike).success).toBe(false);
    expect(
      assetUsageSchema.safeParse({
        category: 'laptop',
        usage_unit: 'battery_cycles',
        usage_value: -1,
      }).success
    ).toBe(false);
    expect(
      assetUsageSchema.safeParse({ category: 'e_bike', usage_unit: 'km', usage_value: 1.5 }).success
    ).toBe(false);
  });
});
