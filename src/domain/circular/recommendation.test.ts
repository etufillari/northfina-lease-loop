import { describe, expect, it } from 'vitest';
import { assessRefurbishment } from './recommendation';
describe('advisory refurbishment screen', () => {
  it('recommends work only with a value surplus and feasible demand', () => {
    expect(assessRefurbishment(100000, 51500, 2)).toMatchObject({
      valueAfterWorkNetCents: 48500,
      recommendation: 'REFURBISH',
    });
    expect(assessRefurbishment(100000, 51500, 0).recommendation).toBe('NO_DEMAND');
  });
  it('flags losses and break-even work for company review', () => {
    expect(assessRefurbishment(51500, 51500, 2).recommendation).toBe('REVIEW_COST');
    expect(assessRefurbishment(100000, 51500, 2, 80000).recommendation).toBe('REVIEW_COST');
    expect(assessRefurbishment(40000, 51500, 2).valueAfterWorkNetCents).toBe(-11500);
  });
  it('rejects invalid cents and counts', () => {
    for (const args of [
      [-1, 0, 0],
      [1, 0.5, 0],
      [1, 0, -1],
      [Number.MAX_SAFE_INTEGER + 1, 0, 0],
    ])
      expect(() => assessRefurbishment(args[0]!, args[1]!, args[2]!)).toThrow();
  });
});

import { projectRefurbishment } from './recommendation';
import {
  loadAssets,
  loadPriceLists,
  loadRefurbishmentCosts,
  loadResidualCurves,
} from '@/data/load';
import { planRefurbishment } from './refurbishment';
it('previews the post-work condition and usage before committing the repairs', async () => {
  const asset = (await loadAssets()).find((row) => row.id === 'ebike-007')!;
  const plan = planRefurbishment(asset, await loadRefurbishmentCosts());
  const price = (await loadPriceLists())[0]!.prices[asset.id]!;
  const projection = projectRefurbishment(
    asset,
    price,
    plan,
    '2026-11-06',
    await loadResidualCurves()
  );
  expect(projection.restoredAsset.condition).toBe('good');
  expect(projection.restoredAsset.usage.value).toBe(0);
  expect(projection.priceCents).toBeGreaterThan(plan.costCents);
  expect(asset.usage.value).toBe(18400);
});
