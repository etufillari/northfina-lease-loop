import { describe, expect, it } from 'vitest';
import { canRequestLeaseChange, reuseEstimate } from './lease-insights';
import type { Co2Factors } from '@/data/schemas';
const factors: Co2Factors = {
  note: '',
  manufacturing_new_kg: { e_bike: 100, laptop: 200, farm_machine: 300 },
  refurbishment_share_of_new: 0.1,
  avoided_by_reuse_formula_hint: '',
  e_bike_avoided_car_km_kg_per_km: 0,
};
describe('lease insights', () => {
  it('estimates one reuse life, discounting worn items', () => {
    expect(reuseEstimate('e_bike', 'good', 0, factors)).toBe(0);
    expect(reuseEstimate('e_bike', 'good', 1, factors)).toBe(81);
    expect(reuseEstimate('e_bike', 'poor', 2, factors)).toBe(36);
    expect(() => reuseEstimate('e_bike', 'poor', -1, factors)).toThrow();
  });
  it('only permits a single pending request for an active lease', () => {
    expect(canRequestLeaseChange('active', 0)).toBe('allowed');
    expect(canRequestLeaseChange('active', 1)).toBe('already_pending');
    expect(canRequestLeaseChange('ended', 0)).toBe('not_active');
  });
});
