import { describe, expect, it } from 'vitest';
import coefficientData from '../../data/coefficient-table.json';
import vatData from '../../data/vat-rates.json';
import { coefficientTableSchema, vatRatesSchema } from '@/data/schemas';
import { calculatePrice } from './pricing';
import { comparePriceOptions, downPaymentBandReference } from './price-comparison';

const input = {
  listPriceCents: 389000,
  downPaymentCents: 0,
  termMonths: [24, 36],
  table: coefficientTableSchema.parse(coefficientData),
  startDate: '2026-11-05',
  upfrontDate: '2026-11-05',
  vatRates: vatRatesSchema.parse(vatData),
};

describe('price comparison', () => {
  it('shows lower monthly rent and higher totals for 36 months on the same basis', () => {
    const before = structuredClone(input);
    expect(comparePriceOptions(input)).toMatchObject([
      {
        termMonths: 24,
        ok: true,
        explanation: {
          terms: { listPriceCents: 389000, downPaymentCents: 0, monthlyNetCents: 13822 },
          firstRent: { grossCents: 17347 },
          buyout: { netCents: 97250, grossCents: 122535 },
          useGrossCents: 417846,
          ownGrossCents: 540381,
        },
      },
      {
        termMonths: 36,
        ok: true,
        explanation: {
          terms: { listPriceCents: 389000, downPaymentCents: 0, monthlyNetCents: 10730 },
          firstRent: { grossCents: 13466 },
          buyout: { netCents: 58350, grossCents: 73521 },
          useGrossCents: 486612,
          ownGrossCents: 560133,
        },
      },
    ]);
    expect(input).toEqual(before);
  });

  it('holds the advance constant and keeps an unavailable term beside valid options', () => {
    const options = comparePriceOptions({
      ...input,
      downPaymentCents: 50000,
      termMonths: [36, 18, 24],
    });
    expect(options).toMatchObject([
      {
        termMonths: 36,
        ok: true,
        explanation: { terms: { downPaymentCents: 50000, financedCents: 339000 } },
      },
      { termMonths: 18, ok: false, reason: 'unknown_term' },
      {
        termMonths: 24,
        ok: true,
        explanation: { terms: { downPaymentCents: 50000, financedCents: 339000 } },
      },
    ]);
  });

  it('checks calendar room for each term instead of hiding all alternatives', () => {
    expect(
      comparePriceOptions({
        ...input,
        startDate: '9996-12-31',
        upfrontDate: '9996-12-31',
        termMonths: [24, 48],
      })
    ).toMatchObject([
      { termMonths: 24, ok: true },
      { termMonths: 48, ok: false, reason: 'invalid_date' },
    ]);
  });

  it('keeps a covered option available when a longer option lacks future VAT', () => {
    const vatRates = {
      ...input.vatRates,
      rates: input.vatRates.rates.map((rate) =>
        rate.valid_to === null ? { ...rate, valid_to: '2028-11-05' } : rate
      ),
    };
    expect(comparePriceOptions({ ...input, vatRates })).toMatchObject([
      { termMonths: 24, ok: true },
      { termMonths: 36, ok: false, reason: 'no_vat_rate' },
    ]);
  });

  it.each([
    ['2026-01-01', '2025-12-31', 'table_not_yet_valid'],
    ['2026-11-05', '2026-11-06', 'invalid_date'],
    ['2026-11-05', 'not-a-date', 'invalid_date'],
  ])('rejects a quote dated %s / %s with %s', (startDate, upfrontDate, reason) => {
    expect(comparePriceOptions({ ...input, startDate, upfrontDate })).toEqual([
      { termMonths: 24, ok: false, reason },
      { termMonths: 36, ok: false, reason },
    ]);
  });

  it('preserves the financing-limit reason instead of offering a zero or invented payment', () => {
    expect(
      comparePriceOptions({ ...input, listPriceCents: 200000, downPaymentCents: 170001 })
    ).toEqual([
      { termMonths: 24, ok: false, reason: 'below_minimum' },
      { termMonths: 36, ok: false, reason: 'below_minimum' },
    ]);
  });
});

describe('down-payment band explanation', () => {
  it.each([
    [1, 208],
    [10000, -78],
  ])(
    'reports the actual signed rent difference after %s cents down',
    (downPaymentCents, difference) => {
      const selected = calculatePrice({
        listPriceCents: 200000,
        downPaymentCents,
        termMonths: 36,
        table: input.table,
      });
      if (!selected.ok) throw new Error('Both band-edge examples must be financeable');
      expect(downPaymentBandReference(selected.terms, input.table)).toMatchObject({
        referenceTerms: { downPaymentCents: 0, band: 'B', monthlyNetCents: 5517 },
        monthlyNetDifferenceCents: difference,
      });
    }
  );

  it.each([
    [389000, 0],
    [389000, 10000],
    [26000000, 1000000],
  ])(
    'omits a reference without two financeable, distinct bands: price %s / advance %s',
    (listPriceCents, downPaymentCents) => {
      const selected = calculatePrice({
        listPriceCents,
        downPaymentCents,
        termMonths: 36,
        table: input.table,
      });
      if (!selected.ok) throw new Error('The selected option must be financeable');
      expect(downPaymentBandReference(selected.terms, input.table)).toBeNull();
    }
  );

  it('does not explain a saved offer using a different coefficient table', () => {
    const selected = calculatePrice({
      listPriceCents: 200000,
      downPaymentCents: 1,
      termMonths: 36,
      table: input.table,
    });
    if (!selected.ok) throw new Error('The boundary option must be financeable');
    expect(downPaymentBandReference(selected.terms, { ...input.table, version: 2 })).toBeNull();
    expect(
      downPaymentBandReference(selected.terms, { ...input.table, id: 'another-table' })
    ).toBeNull();
  });
});
