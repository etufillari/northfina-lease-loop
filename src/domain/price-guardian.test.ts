import { describe, expect, it } from 'vitest';
import coefficientData from '../../data/coefficient-table.json';
import vatData from '../../data/vat-rates.json';
import { coefficientTableSchema, vatRatesSchema } from '@/data/schemas';
import { comparePriceOptions } from './price-comparison';
import { findPriceGuardianSuggestion, type PriceGuardianInput } from './price-guardian';

const input: PriceGuardianInput = {
  listPriceCents: 200000,
  downPaymentCents: 5000,
  termMonths: 36,
  table: coefficientTableSchema.parse(coefficientData),
  startDate: '2026-11-05',
  upfrontDate: '2026-11-05',
  vatRates: vatRatesSchema.parse(vatData),
};

describe('price guardian', () => {
  it('finds the EUR 50 trap using full dated totals, including the higher optional buyout', () => {
    const before = structuredClone(input);
    expect(findPriceGuardianSuggestion(input)).toMatchObject({
      current: {
        terms: { downPaymentCents: 5000, monthlyNetCents: 5582, band: 'A' },
        buyout: { netCents: 29250, grossCents: 36855 },
        useNetCents: 205952,
        ownNetCents: 235202,
        useGrossCents: 259407,
        ownGrossCents: 296262,
      },
      alternative: {
        terms: { downPaymentCents: 0, monthlyNetCents: 5517, band: 'B' },
        buyout: { netCents: 30000, grossCents: 37800 },
        useNetCents: 198612,
        ownNetCents: 228612,
        useGrossCents: 250182,
        ownGrossCents: 287982,
      },
      savings: {
        useNetCents: 7340,
        ownNetCents: 6590,
        useGrossCents: 9225,
        ownGrossCents: 8280,
      },
    });
    expect(input).toEqual(before);
  });

  it('catches a one-cent crossing rather than searching only whole-euro deposits', () => {
    expect(findPriceGuardianSuggestion({ ...input, downPaymentCents: 1 })).toMatchObject({
      current: { terms: { financedCents: 199999, monthlyNetCents: 5725 } },
      alternative: { terms: { financedCents: 200000, downPaymentCents: 0 } },
      savings: { useNetCents: 7489, ownNetCents: 7489, useGrossCents: 9465 },
    });
  });

  it('finds a nonzero boundary when zero upfront would raise monthly rent', () => {
    expect(
      findPriceGuardianSuggestion({ ...input, listPriceCents: 250000, downPaymentCents: 55000 })
    ).toMatchObject({
      alternative: { terms: { downPaymentCents: 50000, financedCents: 200000 } },
      savings: { useNetCents: 7340, ownNetCents: 6590 },
    });
  });

  it('can still suggest a valid boundary when zero upfront exceeds the financing limit', () => {
    expect(
      findPriceGuardianSuggestion({
        ...input,
        listPriceCents: 26000000,
        downPaymentCents: 21000001,
      })
    ).toMatchObject({
      current: { terms: { band: 'C', financedCents: 4999999 } },
      alternative: { terms: { band: 'D', downPaymentCents: 21000000, financedCents: 5000000 } },
    });
  });

  it('does not trade a higher monthly obligation for a lower whole-term total', () => {
    const selected = comparePriceOptions({
      ...input,
      downPaymentCents: 15000,
      termMonths: [36],
    })[0];
    const zero = comparePriceOptions({ ...input, downPaymentCents: 0, termMonths: [36] })[0];
    if (!selected?.ok || !zero?.ok) throw new Error('Both fixtures must be valid');
    expect(zero.explanation.useGrossCents).toBeLessThan(selected.explanation.useGrossCents);
    expect(zero.explanation.terms.monthlyNetCents).toBeGreaterThan(
      selected.explanation.terms.monthlyNetCents
    );
    expect(findPriceGuardianSuggestion({ ...input, downPaymentCents: 15000 })).toBeNull();
  });

  it('rejects a cheaper rental outcome when the optional-purchase outcome is worse', () => {
    // Synthetic valid 100% buyout: later VAT can outweigh an earlier upfront saving.
    const table = structuredClone(input.table);
    table.end_of_term_buyout_percent_of_financed['36'] = 100;
    table.bands[0]!.monthly_factor_by_term['36'] = 0.02;
    table.bands[1]!.monthly_factor_by_term['36'] = 0.0195;
    const selected = comparePriceOptions({ ...input, table, termMonths: [36] })[0];
    const zero = comparePriceOptions({
      ...input,
      table,
      downPaymentCents: 0,
      termMonths: [36],
    })[0];
    if (!selected?.ok || !zero?.ok) throw new Error('Both synthetic offers must be valid');
    expect(zero.explanation.useGrossCents).toBeLessThan(selected.explanation.useGrossCents);
    expect(zero.explanation.ownGrossCents).toBeGreaterThan(selected.explanation.ownGrossCents);
    expect(findPriceGuardianSuggestion({ ...input, table })).toBeNull();
  });

  it.each([
    { downPaymentCents: 0 },
    { listPriceCents: 184000 },
    { listPriceCents: 30000, downPaymentCents: 0 },
    { listPriceCents: 26000000, downPaymentCents: 1000000 },
  ])('returns no suggestion when no checked alternative improves both outcomes: %j', (change) => {
    expect(findPriceGuardianSuggestion({ ...input, ...change })).toBeNull();
  });

  it.each([
    { downPaymentCents: -1 },
    { downPaymentCents: 0.5 },
    { downPaymentCents: Number.NaN },
    { downPaymentCents: 200001 },
    { downPaymentCents: 170001 },
    { listPriceCents: 25000001, downPaymentCents: 0 },
    { termMonths: 18 },
    { startDate: '2026-02-30' },
    { startDate: '2026-11-04' },
    { upfrontDate: '2025-12-31' },
  ])('never recommends from invalid current inputs: %j', (change) => {
    expect(findPriceGuardianSuggestion({ ...input, ...change })).toBeNull();
  });

  it('suppresses savings when future tax coverage is incomplete', () => {
    const vatRates = {
      ...input.vatRates,
      rates: input.vatRates.rates.map((rate) =>
        rate.valid_to === null ? { ...rate, valid_to: '2028-11-05' } : rate
      ),
    };
    expect(findPriceGuardianSuggestion({ ...input, vatRates })).toBeNull();
  });

  it('recomputes from the new offer and dates without keeping a stale suggestion', () => {
    expect(findPriceGuardianSuggestion(input)).not.toBeNull();
    expect(
      findPriceGuardianSuggestion({
        ...input,
        listPriceCents: 184000,
        upfrontDate: '2026-11-06',
        startDate: '2026-11-06',
      })
    ).toBeNull();
    const nextYear = findPriceGuardianSuggestion({
      ...input,
      upfrontDate: '2027-01-31',
      startDate: '2027-01-31',
    });
    expect(nextYear?.alternative.endDate).toBe('2030-01-31');
    expect(nextYear?.alternative.terms.termMonths).toBe(36);
    expect(nextYear?.alternative.useGrossCents).toBe(250236);
    expect(findPriceGuardianSuggestion(input)).toEqual(findPriceGuardianSuggestion(input));
  });
});
