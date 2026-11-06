import { describe, expect, it } from 'vitest';
import vatData from '../../data/vat-rates.json';
import coefficientData from '../../data/coefficient-table.json';
import { coefficientTableSchema, vatRatesSchema } from '@/data/schemas';
import { calculatePrice } from './pricing';
import { leaseTotals } from './totals';

const table = coefficientTableSchema.parse(coefficientData);
const vatRates = vatRatesSchema.parse(vatData);
const result = calculatePrice({
  listPriceCents: 389000,
  downPaymentCents: 0,
  termMonths: 36,
  table,
});
if (!result.ok) throw new Error('The supplied worked example must be financeable');
const terms = result.terms;
const input = { terms, startDate: '2026-11-05', upfrontDate: '2026-11-05', vatRates };
const advanceTerms = {
  ...terms,
  downPaymentCents: 10000,
  monthlyNetCents: 10000,
  totalRentNetCents: 120000,
  buyoutNetCents: 20000,
  termMonths: 12,
};

describe('leaseTotals', () => {
  it('sums the dated gross amounts instead of multiplying the first gross by the term', () => {
    expect(leaseTotals(input)).toEqual({
      ok: true,
      rentGrossCents: 486612,
      useGrossCents: 486612,
      ownGrossCents: 560133,
      issuedGrossCents: 0,
    });
  });

  it('uses an issued amount for its period and forecasts the remaining periods', () => {
    expect(
      leaseTotals({ ...input, issued: [{ kind: 'rent', period: 1, grossCents: 13520 }] })
    ).toEqual({
      ok: true,
      rentGrossCents: 486666,
      useGrossCents: 486666,
      ownGrossCents: 560187,
      issuedGrossCents: 13520,
    });
  });

  it('counts the upfront payment and the optional end purchase separately and exactly once', () => {
    expect(leaseTotals({ ...input, terms: advanceTerms })).toEqual({
      ok: true,
      rentGrossCents: 151100,
      useGrossCents: 163650,
      ownGrossCents: 188850,
      issuedGrossCents: 0,
    });
  });

  it('uses saved rent, advance and buyout amounts without adding the issued total again', () => {
    expect(
      leaseTotals({
        ...input,
        terms: advanceTerms,
        issued: [
          { kind: 'rent', period: 1, grossCents: 12600 },
          { kind: 'down_payment', period: 0, grossCents: 12600 },
          { kind: 'buyout', period: 0, grossCents: 25000 },
        ],
      })
    ).toEqual({
      ok: true,
      rentGrossCents: 151150,
      useGrossCents: 163750,
      ownGrossCents: 188750,
      issuedGrossCents: 50200,
    });
  });

  it('forecasts the advance tax on its own date', () => {
    expect(leaseTotals({ ...input, terms: advanceTerms, upfrontDate: '2027-01-01' })).toEqual({
      ok: true,
      rentGrossCents: 151100,
      useGrossCents: 163700,
      ownGrossCents: 188900,
      issuedGrossCents: 0,
    });
  });

  it('does not invent a future tax rate if the rental schedule has a gap', () => {
    expect(
      leaseTotals({
        ...input,
        vatRates: { ...vatRates, rates: vatRates.rates.filter((rate) => rate.valid_to !== null) },
      })
    ).toEqual({ ok: false });
  });

  it('fails when only the advance date lacks a VAT rate', () => {
    expect(leaseTotals({ ...input, upfrontDate: '2012-12-31' })).toEqual({ ok: false });
  });

  it('fails when VAT covers all rent but not the later maturity date', () => {
    const endsWithRent = {
      ...vatRates,
      rates: vatRates.rates.map((rate) =>
        rate.valid_to === null ? { ...rate, valid_to: '2029-10-05' } : rate
      ),
    };
    expect(leaseTotals({ ...input, vatRates: endsWithRent })).toEqual({ ok: false });
  });

  it('requires forecast rate coverage even when saved documents are supplied', () => {
    expect(
      leaseTotals({
        ...input,
        vatRates: { ...vatRates, rates: [] },
        issued: [{ kind: 'rent', period: 1, grossCents: 13520 }],
      })
    ).toEqual({ ok: false });
  });

  it.each([-1, 0.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1])(
    'rejects invalid issued cents: %s',
    (grossCents) => {
      expect(() =>
        leaseTotals({ ...input, issued: [{ kind: 'rent', period: 1, grossCents }] })
      ).toThrow('issued amounts must be non-negative safe integer cents');
    }
  );

  it('rejects fractional documents even if their sum would be an integer', () => {
    expect(() =>
      leaseTotals({
        ...input,
        issued: [
          { kind: 'rent', period: 1, grossCents: 0.5 },
          { kind: 'rent', period: 2, grossCents: 0.5 },
        ],
      })
    ).toThrow('issued amounts must be non-negative safe integer cents');
  });

  it.each(['rent', 'down_payment', 'buyout'])(
    'rejects a total overflow caused by a safe individual %s document',
    (kind) => {
      expect(() =>
        leaseTotals({
          ...input,
          issued: [{ kind, period: kind === 'rent' ? 1 : 0, grossCents: Number.MAX_SAFE_INTEGER }],
        })
      ).toThrow('totals must remain non-negative safe integer cents');
    }
  );

  it('does not change source terms, VAT rates or issued documents', () => {
    const value = { ...input, issued: [{ kind: 'rent', period: 1, grossCents: 13520 }] };
    const before = structuredClone(value);
    const first = leaseTotals(value);
    expect(leaseTotals(value)).toEqual(first);
    expect(value).toEqual(before);
  });
});
