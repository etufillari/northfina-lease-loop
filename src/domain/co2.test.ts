import { describe, expect, it } from 'vitest';
import { loadCo2Factors, loadResidualCurves } from '@/data/load';
import { co2Impact, fleetImpact, lifeLeftShare, type Co2Input } from './co2';

const factors = await loadCo2Factors();
const curves = await loadResidualCurves();

// Scenario card 10: ebike-008 (Kettu Urban 1, 2022, good, 9800 km) has had 2 lives and is
// leased again on 6 Nov 2026. Age 52 months: 29 % on the curve × 0.85 (good) × 0.82 (9 × −2 %).
const ebike008 = (overrides: Partial<Co2Input> = {}): Co2Input => ({
  category: 'e_bike',
  previousLives: 2,
  leasedNow: true,
  lifeLeft: lifeLeftShare(curves, {
    category: 'e_bike',
    ageMonths: 52,
    condition: 'good',
    usage: 9800,
  }),
  newPriceCents: 179_900,
  km: 9800,
  ...overrides,
});

describe('lifeLeftShare', () => {
  it('multiplies the age curve, the condition and the usage', () => {
    expect(
      lifeLeftShare(curves, { category: 'e_bike', ageMonths: 52, condition: 'good', usage: 9800 })
    ).toBeCloseTo(0.29 * 0.85 * 0.82, 10);
  });

  it('is 1 for a new, unused item and never below 0', () => {
    expect(
      lifeLeftShare(curves, { category: 'laptop', ageMonths: 0, condition: 'new', usage: 0 })
    ).toBe(1);
    expect(
      lifeLeftShare(curves, { category: 'laptop', ageMonths: 999, condition: 'poor', usage: 1e7 })
    ).toBeGreaterThanOrEqual(0);
  });
});

describe('co2Impact', () => {
  it('card 10: the third life of ebike-008 counts two reuse lives, scaled by life left', () => {
    expect(co2Impact(factors, ebike008())).toEqual({
      livesStarted: 3,
      reuseLives: 2,
      newItemKg: 165,
      perReuseLifeKg: 165 * 0.88,
      // 2 × 145.2 × 0.20213 = 58.7
      reuseSavedKg: 59,
      // 2 × 179900 × (1 − 0.20213), rounded once per life
      moneySavedCents: 287_074,
      ridingSavedKg: 1470, // 9800 km × 0.15
    });
  });

  it('counts the running lease: before it starts, ebike-008 has one reuse life', () => {
    expect(co2Impact(factors, ebike008({ leasedNow: false })).reuseLives).toBe(1);
  });

  it('gives no reuse credit to an item in its first life', () => {
    const first = co2Impact(factors, ebike008({ previousLives: 0, leasedNow: true }));
    expect(first).toMatchObject({ reuseLives: 0, reuseSavedKg: 0, moneySavedCents: 0 });
  });

  it('gives an almost worn-out item less credit than one in good shape', () => {
    const worn = co2Impact(factors, ebike008({ lifeLeft: 0.1 }));
    const fresh = co2Impact(factors, ebike008({ lifeLeft: 0.9 }));
    expect(worn.reuseSavedKg).toBeLessThan(fresh.reuseSavedKg);
    expect(fresh.reuseSavedKg).toBe(Math.round(2 * 145.2 * 0.9));
  });

  it('only counts riding for e-bikes', () => {
    expect(co2Impact(factors, ebike008({ category: 'laptop', km: null })).ridingSavedKg).toBe(0);
  });
});

describe('fleetImpact', () => {
  it('adds up the items', () => {
    const a = co2Impact(factors, ebike008());
    const b = co2Impact(factors, ebike008({ previousLives: 0, km: 100 }));
    expect(fleetImpact([a, b])).toEqual({
      itemsReused: 1,
      reuseLives: 2,
      reuseSavedKg: 59,
      moneySavedCents: 287_074,
      ridingSavedKg: 1470 + 15,
    });
  });
});
