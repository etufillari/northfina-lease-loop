import { beforeAll, describe, expect, it } from 'vitest';
import { loadRefurbishmentCosts } from '@/data/load';
import type { RefurbishmentCosts } from '@/data/schemas';
import {
  categoryServiceInterval,
  initialUsage,
  recordReading,
  serviceInterval,
  valueFollowsTotal,
  valueUsage,
} from './usage';

let costs: RefurbishmentCosts;
beforeAll(async () => {
  costs = await loadRefurbishmentCosts();
});

describe('service intervals', () => {
  it('reads the farm machines’ "per started 1000 engine_hours since last service"', () => {
    expect(serviceInterval('per started 1000 engine_hours since last service')).toBe(1000);
    expect(serviceInterval('always')).toBeNull();
    expect(serviceInterval('usage.value >= 15000 km')).toBeNull();
    expect(categoryServiceInterval('farm_machine', costs)).toBe(1000);
    expect(categoryServiceInterval('e_bike', costs)).toBeNull();
  });
});

describe('which counter market value follows', () => {
  it('since the last battery for e-bikes and laptops, the lifetime total for farm machines', () => {
    expect(valueFollowsTotal('e_bike', costs)).toBe(false);
    expect(valueFollowsTotal('laptop', costs)).toBe(false);
    expect(valueFollowsTotal('farm_machine', costs)).toBe(true);
    const bike = {
      category: 'e_bike' as const,
      usage: { unit: 'km' as const, value: 300, total: 18_700 },
    };
    expect(valueUsage(bike, costs)).toBe(300);
    expect(valueUsage(bike, costs, 0)).toBe(0);
    const farm = {
      category: 'farm_machine' as const,
      usage: { unit: 'engine_hours' as const, value: 200, total: 4200 },
    };
    expect(valueUsage(farm, costs)).toBe(4200);
    expect(valueUsage(farm, costs, 0)).toBe(4200);
  });

  it('falls back to the one counter when no total is known', () => {
    const farm = {
      category: 'farm_machine' as const,
      usage: { unit: 'engine_hours' as const, value: 90 },
    };
    expect(valueUsage(farm, costs)).toBe(90);
  });
});

describe('initialUsage: the data pack gives one number', () => {
  it('is the lifetime total, and since-reset too for batteries', () => {
    const bike = { category: 'e_bike' as const, usage: { unit: 'km' as const, value: 18_400 } };
    expect(initialUsage(bike, costs)).toEqual({ total: 18_400, sinceReset: 18_400 });
  });

  it('assumes farm machines were serviced on schedule', () => {
    const farm = (value: number) => ({
      category: 'farm_machine' as const,
      usage: { unit: 'engine_hours' as const, value },
    });
    expect(initialUsage(farm(4200), costs)).toEqual({ total: 4200, sinceReset: 200 });
    expect(initialUsage(farm(140), costs)).toEqual({ total: 140, sinceReset: 140 });
    expect(initialUsage(farm(3000), costs)).toEqual({ total: 3000, sinceReset: 0 });
  });
});

describe('recordReading: the meter at a return', () => {
  it('adds what the lease used to both counters', () => {
    expect(recordReading({ total: 18_400, sinceReset: 400 }, 21_000)).toEqual({
      ok: true,
      total: 21_000,
      sinceReset: 3000,
      added: 2600,
    });
    expect(recordReading({ total: 100, sinceReset: 100 }, 100)).toMatchObject({
      ok: true,
      added: 0,
    });
  });

  it('refuses a reading below the lifetime total, or not a whole number', () => {
    expect(recordReading({ total: 18_400, sinceReset: 0 }, 18_399)).toEqual({
      ok: false,
      reason: 'reading_below_total',
    });
    expect(recordReading({ total: 0, sinceReset: 0 }, 1.5)).toEqual({
      ok: false,
      reason: 'reading_not_whole',
    });
    expect(recordReading({ total: 0, sinceReset: 0 }, -1)).toMatchObject({ ok: false });
  });
});
