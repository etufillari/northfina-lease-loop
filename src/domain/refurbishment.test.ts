import { beforeAll, describe, expect, it } from 'vitest';
import { loadAssets, loadRefurbishmentCosts } from '@/data/load';
import type { Asset, RefurbishmentCosts } from '@/data/schemas';
import { calculateRefurbishment } from './refurbishment';

let assets: Asset[];
let costs: RefurbishmentCosts;

beforeAll(async () => {
  [assets, costs] = await Promise.all([loadAssets(), loadRefurbishmentCosts()]);
});

function findAsset(id: string): Asset {
  const asset = assets.find((item) => item.id === id);

  if (!asset) {
    throw new Error(`Missing test asset: ${id}`);
  }

  return asset;
}

describe('calculateRefurbishment', () => {
  it('keeps ebike-007 fair for a total cost of €395', () => {
    const result = calculateRefurbishment({
      asset: findAsset('ebike-007'),
      costs,
      targetCondition: 'fair',
    });

    expect(result).toMatchObject({
      ok: true,
      totalCostCents: 39_500,
      resultingCondition: 'fair',
      resultingUsage: 0,
      usageReset: true,
    });
  });

  it('upgrades ebike-007 to good for a total cost of €515', () => {
    const result = calculateRefurbishment({
      asset: findAsset('ebike-007'),
      costs,
      targetCondition: 'good',
    });

    expect(result).toMatchObject({
      ok: true,
      totalCostCents: 51_500,
      resultingCondition: 'good',
      resultingUsage: 0,
      usageReset: true,
    });
  });

  it('does not replace an e-bike battery below 15000 km', () => {
    const asset = {
      ...findAsset('ebike-007'),
      usage: {
        unit: 'km' as const,
        value: 14_999,
      },
    };

    const result = calculateRefurbishment({
      asset,
      costs,
      targetCondition: 'fair',
    });

    expect(result).toMatchObject({
      ok: true,
      totalCostCents: 4_500,
      resultingUsage: 14_999,
      usageReset: false,
    });
  });

  it('requires farm-machine service history when usage is nonzero', () => {
    const asset = findAsset('farm-005');

    const result = calculateRefurbishment({
      asset,
      costs,
      targetCondition: 'good',
    });

    expect(result).toEqual({
      ok: false,
      reason: 'missing_service_history',
    });
  });

  it('charges two started 1000-hour service intervals', () => {
    const asset = findAsset('farm-005');

    const result = calculateRefurbishment({
      asset,
      costs,
      targetCondition: 'good',
      usageSinceLastService: 1_001,
    });

    expect(result).toMatchObject({
      ok: true,
      totalCostCents: 340_000,
      resultingCondition: 'good',
      resultingUsage: asset.usage.value,
      usageReset: false,
    });
  });
});
