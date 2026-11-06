import { beforeAll, describe, expect, it } from 'vitest';
import { loadVatRates } from '@/data/load';
import type { VatRates } from '@/data/schemas';
import { canScheduleLease, invoiceSchedule, termEndDate } from './invoicing';

let rates: VatRates;
beforeAll(async () => {
  rates = await loadVatRates();
});

it.each<[string, number, boolean]>([
  ['9996-12-31', 36, true],
  ['9997-01-01', 36, false],
  ['0000-01-01', 36, false],
  ['10000-01-01', 36, false],
  ['2026-02-29', 36, false],
  ['2026-11-05', 0, false],
  ['2026-11-05', 1.5, false],
  ['2026-11-05', 1200, true],
  ['2026-11-05', 1201, false],
])('checks that the whole lease fits the supported calendar: %s + %s', (startDate, months, ok) => {
  expect(canScheduleLease(startDate, months)).toBe(ok);
});

describe('locked-rent schedule', () => {
  it('produces the first three Aino invoices and reconciles all 36 amounts', () => {
    const result = invoiceSchedule(
      { startDate: '2026-11-05', termMonths: 36, monthlyNetCents: 10730 },
      rates
    );
    if (!result.ok) throw new Error('fixture VAT rates must cover the schedule');
    expect(result.invoices.slice(0, 3)).toEqual([
      {
        period: 1,
        invoiceDate: '2026-11-05',
        dueDate: '2026-11-05',
        netCents: 10730,
        vatBasisPoints: 2550,
        vatCents: 2736,
        grossCents: 13466,
      },
      {
        period: 2,
        invoiceDate: '2026-12-05',
        dueDate: '2026-12-05',
        netCents: 10730,
        vatBasisPoints: 2550,
        vatCents: 2736,
        grossCents: 13466,
      },
      {
        period: 3,
        invoiceDate: '2027-01-05',
        dueDate: '2027-01-05',
        netCents: 10730,
        vatBasisPoints: 2600,
        vatCents: 2790,
        grossCents: 13520,
      },
    ]);
    expect(result.invoices).toHaveLength(36);
    expect(result.invoices.at(-1)).toMatchObject({ period: 36, invoiceDate: '2029-10-05' });
    expect(result.invoices.reduce((sum, row) => sum + row.netCents, 0)).toBe(386280);
    expect(result.invoices.reduce((sum, row) => sum + row.grossCents, 0)).toBe(486612);
    expect(termEndDate('2026-11-05', 36)).toBe('2029-11-05');
  });

  it('anchors January 31 without drift and does not invent a 25th or 26th invoice', () => {
    const result = invoiceSchedule(
      { startDate: '2026-01-31', termMonths: 24, monthlyNetCents: 5000 },
      rates
    );
    if (!result.ok) throw new Error('fixture VAT rates must cover the schedule');
    expect(result.invoices).toHaveLength(24);
    expect(result.invoices[1]?.invoiceDate).toBe('2026-02-28');
    expect(result.invoices[2]?.invoiceDate).toBe('2026-03-31');
    expect(result.invoices.at(-1)?.invoiceDate).toBe('2027-12-31');
    expect(result.invoices.some((row) => row.invoiceDate.startsWith('2028-02'))).toBe(false);
    expect(termEndDate('2026-01-31', 24)).toBe('2028-01-31');
  });

  it('includes leap-year February in the 36-month calendar scenario', () => {
    const result = invoiceSchedule(
      { startDate: '2026-01-31', termMonths: 36, monthlyNetCents: 5000 },
      rates
    );
    if (!result.ok) throw new Error('fixture VAT rates must cover the schedule');
    expect(result.invoices).toHaveLength(36);
    expect(result.invoices[1]?.dueDate).toBe('2026-02-28');
    expect(result.invoices[25]?.dueDate).toBe('2028-02-29');
    expect(result.invoices[26]?.dueDate).toBe('2028-03-31');
    expect(result.invoices.at(-1)?.dueDate).toBe('2028-12-31');
    expect(termEndDate('2026-01-31', 36)).toBe('2029-01-31');
  });

  it('charges a full first period for a mid-month start', () => {
    const result = invoiceSchedule(
      { startDate: '2026-09-15', termMonths: 24, monthlyNetCents: 5000 },
      rates
    );
    if (!result.ok) throw new Error('fixture VAT rates must cover the schedule');
    expect(result.invoices[0]).toEqual({
      period: 1,
      invoiceDate: '2026-09-15',
      dueDate: '2026-09-15',
      netCents: 5000,
      vatBasisPoints: 2550,
      vatCents: 1275,
      grossCents: 6275,
    });
  });

  it('fails if the first scheduled date has no VAT rate', () => {
    expect(
      invoiceSchedule({ startDate: '2012-01-01', termMonths: 24, monthlyNetCents: 5000 }, rates)
    ).toEqual({ ok: false, reason: 'no_vat_rate' });
  });

  it('discards the entire forecast if a later period has no VAT rate', () => {
    const gap = {
      ...rates,
      rates: rates.rates.map((rate) =>
        rate.valid_from === '2027-01-01' ? { ...rate, valid_from: '2027-02-01' } : rate
      ),
    };
    expect(
      invoiceSchedule({ startDate: '2026-11-05', termMonths: 4, monthlyNetCents: 10730 }, gap)
    ).toEqual({ ok: false, reason: 'no_vat_rate' });
  });

  it('supports a single full period and a separate maturity date', () => {
    const result = invoiceSchedule(
      { startDate: '2026-01-31', termMonths: 1, monthlyNetCents: 0 },
      rates
    );
    expect(result).toEqual({
      ok: true,
      invoices: [
        {
          period: 1,
          invoiceDate: '2026-01-31',
          dueDate: '2026-01-31',
          netCents: 0,
          vatBasisPoints: 2550,
          vatCents: 0,
          grossCents: 0,
        },
      ],
    });
    expect(termEndDate('2026-01-31', 1)).toBe('2026-02-28');
  });

  it('accepts the technical limit of 1200 months without adding a maturity invoice', () => {
    const result = invoiceSchedule(
      { startDate: '2026-01-31', termMonths: 1200, monthlyNetCents: 1 },
      rates
    );
    if (!result.ok) throw new Error('fixture VAT rates must cover the schedule');
    expect(result.invoices).toHaveLength(1200);
    expect(result.invoices.at(-1)).toMatchObject({ period: 1200, invoiceDate: '2125-12-31' });
    expect(termEndDate('2026-01-31', 1200)).toBe('2126-01-31');
  });

  it.each([0, -1, 1.5, 1201, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER])(
    'rejects invalid term %s in both calendar operations',
    (termMonths) => {
      expect(() =>
        invoiceSchedule({ startDate: '2026-11-05', termMonths, monthlyNetCents: 5000 }, rates)
      ).toThrow('schedule needs 1..1200 whole months');
      expect(() => termEndDate('2026-11-05', termMonths)).toThrow(
        'schedule needs 1..1200 whole months'
      );
    }
  );

  it('propagates invalid dates and calendar overflow', () => {
    expect(() =>
      invoiceSchedule({ startDate: '2026-02-29', termMonths: 1, monthlyNetCents: 5000 }, rates)
    ).toThrow(RangeError);
    expect(() => termEndDate('2026-02-29', 1)).toThrow(RangeError);
    expect(() =>
      invoiceSchedule({ startDate: '9999-12-31', termMonths: 2, monthlyNetCents: 5000 }, rates)
    ).toThrow(RangeError);
    expect(() => termEndDate('9999-12-31', 1)).toThrow(RangeError);
  });

  it.each([-1, 0.5, Number.MAX_SAFE_INTEGER])(
    'propagates invalid or overflowing monthly amounts: %s',
    (monthlyNetCents) => {
      expect(() =>
        invoiceSchedule({ startDate: '2026-11-05', termMonths: 1, monthlyNetCents }, rates)
      ).toThrow(RangeError);
    }
  );

  it('does not change the contract or VAT table and returns independent forecast rows', () => {
    const contract = { startDate: '2026-11-05', termMonths: 3, monthlyNetCents: 10730 };
    const before = structuredClone({ contract, rates });
    const result = invoiceSchedule(contract, rates);
    if (!result.ok) throw new Error('fixture VAT rates must cover the schedule');
    expect({ contract, rates }).toEqual(before);
    expect(result.invoices[0]).not.toBe(result.invoices[1]);
    expect(invoiceSchedule(contract, rates)).toEqual(result);
  });
});
