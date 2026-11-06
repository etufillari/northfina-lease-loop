import { describe, expect, it } from 'vitest';
import coefficientData from '../../data/coefficient-table.json';
import vatData from '../../data/vat-rates.json';
import { coefficientTableSchema, vatRatesSchema } from '@/data/schemas';
import { calculatePrice } from './pricing';
import { explainPrice } from './price-explanation';

const table = coefficientTableSchema.parse(coefficientData);
const vatRates = vatRatesSchema.parse(vatData);
const priced = calculatePrice({
  listPriceCents: 389000,
  downPaymentCents: 0,
  termMonths: 36,
  table,
});
if (!priced.ok) throw new Error('The worked example must be financeable');
const input = {
  terms: priced.terms,
  startDate: '2026-11-05',
  upfrontDate: '2026-11-05',
  vatRates,
};

describe('price explanation', () => {
  it('shows the two dated monthly amounts and sums them without taxing or rounding twice', () => {
    const result = explainPrice(input);
    expect(result).toMatchObject({
      ok: true,
      explanation: {
        firstRent: { invoiceDate: '2026-11-05', netCents: 10730, grossCents: 13466 },
        rentalPeriods: [
          {
            firstDate: '2026-11-05',
            lastDate: '2026-12-05',
            count: 2,
            netCents: 10730,
            vatBasisPoints: 2550,
            vatCents: 2736,
            grossCents: 13466,
          },
          {
            firstDate: '2027-01-05',
            lastDate: '2029-10-05',
            count: 34,
            netCents: 10730,
            vatBasisPoints: 2600,
            vatCents: 2790,
            grossCents: 13520,
          },
        ],
        upfront: { netCents: 0, vatCents: 0, grossCents: 0 },
        buyout: { netCents: 58350, vatBasisPoints: 2600, vatCents: 15171, grossCents: 73521 },
        endDate: '2029-11-05',
        rentNetCents: 386280,
        useNetCents: 386280,
        ownNetCents: 444630,
        rentGrossCents: 486612,
        useGrossCents: 486612,
        ownGrossCents: 560133,
      },
    });
  });

  it.each([
    ['2026-12-31', 62750, 511166, 578904],
    ['2027-01-01', 63000, 511416, 579154],
  ])(
    'keeps the advance and purchase separate with advance date %s',
    (upfrontDate, upfront, use, own) => {
      const withAdvance = calculatePrice({
        listPriceCents: 408400,
        downPaymentCents: 50000,
        termMonths: 36,
        table,
      });
      if (!withAdvance.ok) throw new Error('The advance example must be financeable');
      expect(
        explainPrice({ ...input, terms: withAdvance.terms, startDate: '2027-01-01', upfrontDate })
      ).toMatchObject({
        ok: true,
        explanation: {
          upfront: { netCents: 50000, grossCents: upfront },
          buyout: { netCents: 53760, grossCents: 67738 },
          rentNetCents: 355896,
          useNetCents: 405896,
          ownNetCents: 459656,
          rentGrossCents: 448416,
          useGrossCents: use,
          ownGrossCents: own,
        },
      });
    }
  );

  it.each([
    ['2026-02-29', '2026-11-05'],
    ['9997-01-01', '9997-01-01'],
    ['2026-11-05', 'not-a-date'],
  ])('returns an unavailable result for start %s and upfront %s', (startDate, upfrontDate) => {
    expect(explainPrice({ ...input, startDate, upfrontDate })).toEqual({
      ok: false,
      reason: 'invalid_date',
    });
  });

  it.each(['2026-11-04', '2026-12-31', '2029-10-05'])(
    'does not present a complete gross total when VAT coverage ends on %s',
    (validTo) => {
      const incompleteRates = {
        ...vatRates,
        rates: [{ rate_percent: 25.5, valid_from: '2013-01-01', valid_to: validTo }],
      };
      expect(explainPrice({ ...input, vatRates: incompleteRates })).toEqual({
        ok: false,
        reason: 'no_vat_rate',
      });
    }
  );

  it('keeps repeated rates in separate chronological groups and does not mutate its inputs', () => {
    const changingRates = {
      ...input,
      vatRates: {
        ...vatRates,
        rates: [
          { rate_percent: 25.5, valid_from: '2026-01-01', valid_to: '2026-12-31' },
          { rate_percent: 26, valid_from: '2027-01-01', valid_to: '2027-12-31' },
          { rate_percent: 25.5, valid_from: '2028-01-01', valid_to: null },
        ],
      },
    };
    const before = structuredClone(changingRates);
    const result = explainPrice(changingRates);
    if (!result.ok) throw new Error('The test rates cover the full schedule');
    expect(
      result.explanation.rentalPeriods.map(({ count, vatBasisPoints }) => [count, vatBasisPoints])
    ).toEqual([
      [2, 2550],
      [12, 2600],
      [22, 2550],
    ]);
    expect(changingRates).toEqual(before);
  });
});
