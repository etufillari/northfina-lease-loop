import { beforeAll, describe, expect, it } from 'vitest';
import {
  loadAssets,
  loadCoefficientTable,
  loadPriceLists,
  loadTermLimits,
  loadVatRates,
} from '@/data/load';
import { compareTerms } from './compare';
import type { PricingData } from './quote';

let data: PricingData;
beforeAll(async () => {
  data = {
    priceLists: await loadPriceLists(),
    table: await loadCoefficientTable(),
    vatRates: await loadVatRates(),
    termLimits: await loadTermLimits(),
    assets: await loadAssets(),
  };
});

const input = { assetId: 'ebike-003', downPaymentCents: 0, isoDate: '2026-11-05' };

describe('compareTerms', () => {
  it('prices card 1 at every term of the table, shortest first', () => {
    const result = compareTerms(data, input);
    expect(result.rows.map((r) => r.termMonths)).toEqual([12, 24, 36, 48]);
    expect(result.unavailable).toEqual([]);
    const row36 = result.rows.find((r) => r.termMonths === 36)!;
    expect(row36).toEqual({
      termMonths: 36,
      band: 'B',
      monthlyNetCents: 10_730,
      monthlyGrossCents: 13_466,
      buyoutCents: 58_350,
      buyoutGrossCents: 73_229,
      totalIfReturnCents: 36 * 13_466,
      totalIfBuyCents: 36 * 13_466 + 73_229,
    });
  });

  it('shows a laptop only the terms under its cap (D43): 48 is neither a row nor unavailable', () => {
    const result = compareTerms(data, { ...input, assetId: 'laptop-004' });
    expect(result.rows.map((r) => r.termMonths)).toEqual([12, 24, 36]);
    expect(result.unavailable).toEqual([]);
  });

  it('lowers the monthly rent as the term grows', () => {
    const nets = compareTerms(data, input).rows.map((r) => r.monthlyNetCents);
    expect([...nets].sort((a, b) => b - a)).toEqual(nets);
  });

  it('lists every term as unavailable, with the reason, for an item below the lowest band', () => {
    const result = compareTerms(data, { ...input, assetId: 'ebike-010' });
    expect(result.rows).toEqual([]);
    expect(result.unavailable.map((u) => u.termMonths)).toEqual([12, 24, 36, 48]);
    expect(result.unavailable[0]!.reason.code).toBe('below_minimum');
  });

  it('marks only the term a substituted table lacks for the band', () => {
    const [a, b, ...rest] = data.table.bands;
    const { 48: dropped, ...factors } = b!.monthly_factor_by_term;
    void dropped;
    const table = {
      ...data.table,
      bands: [a!, { ...b!, monthly_factor_by_term: factors }, ...rest],
    };
    const result = compareTerms({ ...data, table }, input);
    expect(result.rows.map((r) => r.termMonths)).toEqual([12, 24, 36]);
    expect(result.unavailable).toEqual([
      {
        termMonths: 48,
        reason: { code: 'unknown_term', params: { termMonths: 48, terms: [12, 24, 36, 48] } },
      },
    ]);
  });
});
