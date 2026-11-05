import { beforeAll, describe, expect, it } from 'vitest';
import { loadCoefficientTable } from '@/data/load';
import type { CoefficientTable } from '@/data/schemas';
import { leasePriceFor } from './pricing';

let table: CoefficientTable;

beforeAll(async () => {
  table = await loadCoefficientTable();
});

function tableWithTerm(
  source: CoefficientTable,
  termMonths: number,
  factor: number,
  buyoutPercent: number
): CoefficientTable {
  const term = String(termMonths);
  return {
    ...source,
    end_of_term_buyout_percent_of_financed: {
      ...source.end_of_term_buyout_percent_of_financed,
      [term]: buyoutPercent,
    },
    bands: source.bands.map((band) => ({
      ...band,
      monthly_factor_by_term: {
        ...band.monthly_factor_by_term,
        [term]: factor,
      },
    })),
  };
}

describe('leasePriceFor', () => {
  it('calculates the documented e-bike example', () => {
    expect(leasePriceFor(table, 389_000, 0, 36)).toMatchObject({
      ok: true,
      financedCents: 389_000,
      band: { band: 'B' },
      factor: 0.027584,
      monthlyNetRentCents: 10_730,
      buyoutPercent: 15,
      endOfTermBuyoutCents: 58_350,
      totalCostWithBuyoutCents: 444_630,
    });
  });

  it('uses the financed amount after the down payment to choose the band', () => {
    expect(leasePriceFor(table, 200_000, 1, 36)).toMatchObject({
      ok: true,
      financedCents: 199_999,
      band: { band: 'A' },
    });
    expect(leasePriceFor(table, 200_000, 0, 36)).toMatchObject({
      ok: true,
      financedCents: 200_000,
      band: { band: 'B' },
    });
  });

  it('supports a new term when the table contains its factor and buyout', () => {
    const threeMonthTable = tableWithTerm(table, 3, 0.01, 10);

    expect(leasePriceFor(threeMonthTable, 389_000, 0, 3)).toMatchObject({
      ok: true,
      termMonths: 3,
      monthlyNetRentCents: 3_890,
      endOfTermBuyoutCents: 38_900,
      totalCostWithBuyoutCents: 50_570,
    });
  });

  it('includes the down payment exactly once in the total cost', () => {
    expect(leasePriceFor(table, 389_000, 100_000, 36)).toMatchObject({
      ok: true,
      downPaymentCents: 100_000,
      financedCents: 289_000,
      monthlyNetRentCents: 7_972,
      endOfTermBuyoutCents: 43_350,
      totalCostWithBuyoutCents: 430_342,
    });
  });

  it('rejects a term when its buyout percentage is missing', () => {
    const factorOnlyTable: CoefficientTable = {
      ...table,
      bands: table.bands.map((band) => ({
        ...band,
        monthly_factor_by_term: {
          ...band.monthly_factor_by_term,
          '3': 0.01,
        },
      })),
    };

    expect(leasePriceFor(factorOnlyTable, 389_000, 0, 3)).toEqual({
      ok: false,
      reason: 'unknown_term',
    });
  });

  it('rounds rent and buyout once to the nearest cent', () => {
    const roundingTable = tableWithTerm(table, 3, 0.0000025, 0.00025);

    expect(leasePriceFor(roundingTable, 200_000, 0, 3)).toMatchObject({
      ok: true,
      monthlyNetRentCents: 1,
      endOfTermBuyoutCents: 1,
    });
  });

  it('reports an excessive down payment as a business failure', () => {
    expect(leasePriceFor(table, 100_000, 100_001, 24)).toEqual({
      ok: false,
      reason: 'down_payment_exceeds_list_price',
    });
  });

  it('reports table amount and term failures', () => {
    expect(leasePriceFor(table, 29_999, 0, 24)).toEqual({
      ok: false,
      reason: 'below_minimum',
    });
    expect(leasePriceFor(table, 25_000_001, 0, 24)).toEqual({
      ok: false,
      reason: 'above_maximum',
    });
    expect(leasePriceFor(table, 189_900, 0, 3)).toEqual({
      ok: false,
      reason: 'unknown_term',
    });
  });

  it('reports a fully paid price as below the financing minimum', () => {
    expect(leasePriceFor(table, 100_000, 100_000, 24)).toEqual({
      ok: false,
      reason: 'below_minimum',
    });
  });

  it('throws for invalid money inputs', () => {
    expect(() => leasePriceFor(table, 1_999.5, 0, 24)).toThrow(RangeError);
    expect(() => leasePriceFor(table, 1_000, -1, 24)).toThrow(RangeError);
  });
});
