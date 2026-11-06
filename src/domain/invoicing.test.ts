import { beforeAll, describe, expect, it } from 'vitest';
import { loadVatRates } from '@/data/load';
import type { VatRates } from '@/data/schemas';
import {
  invoiceSchedule,
  splitByDate,
  sumInvoices,
  invoiceLabel,
  upcomingVatChange,
  withStatus,
  type Invoice,
} from './invoicing';

let vatRates: VatRates;
beforeAll(async () => {
  vatRates = await loadVatRates();
});

function schedule(startDate: string, termMonths: number, monthlyNetCents: number): Invoice[] {
  const result = invoiceSchedule({ startDate, termMonths, monthlyNetCents }, vatRates);
  if (!result.ok) throw new Error(result.reason);
  return result.invoices;
}

describe('invoiceSchedule', () => {
  it('card 1: Aino’s first three invoices for ebike-003 from 5 Nov 2026', () => {
    const [first, second, third] = schedule('2026-11-05', 36, 10_730);
    expect(first).toEqual({
      number: 1,
      dueDate: '2026-11-05',
      periodStart: '2026-11-05',
      periodEnd: '2026-12-04',
      netCents: 10_730,
      vatPercent: 25.5,
      vatCents: 2_736,
      totalCents: 13_466,
      vatChangedFrom: null,
    });
    expect(second).toMatchObject({ dueDate: '2026-12-05', totalCents: 13_466 });
    // From 1 Jan 2027 the (fictional) VAT is 26 %: 10730 × 26 % = 2789.8 → 2790
    expect(third).toMatchObject({
      dueDate: '2027-01-05',
      vatPercent: 26,
      vatCents: 2_790,
      totalCents: 13_520,
      vatChangedFrom: 25.5,
    });
  });

  it('card 3: ebike-001 from 15 Sep 2026 — December at 25.5 %, January at 26 %', () => {
    // ebike-001 list 1: 189900, band A, 24 months: 189900 × 0.036637 = 6957.4 → 6957
    const invoices = schedule('2026-09-15', 24, 6_957);
    const december = invoices.find((i) => i.dueDate === '2026-12-15');
    const january = invoices.find((i) => i.dueDate === '2027-01-15');
    expect(december).toMatchObject({ netCents: 6_957, vatPercent: 25.5, vatCents: 1_774 });
    expect(january).toMatchObject({
      netCents: 6_957, // the locked rent does not move
      vatPercent: 26,
      vatCents: 1_809,
      vatChangedFrom: 25.5,
    });
  });

  it('card 4: laptop-001 from 31 Jan 2026 is due 28 Feb 2026 and 29 Feb 2028', () => {
    const invoices = schedule('2026-01-31', 36, 4_000);
    const dueDates = invoices.map((i) => i.dueDate);
    expect(dueDates).toContain('2026-02-28');
    expect(dueDates).toContain('2028-02-29');
    // counted from the start date, so March is back on the 31st, not stuck on the 28th
    expect(dueDates).toContain('2026-03-31');
    expect(invoices[1]).toMatchObject({ periodStart: '2026-02-28', periodEnd: '2026-03-30' });
  });

  it('makes one invoice per month, with periods that touch and cover the whole term', () => {
    const invoices = schedule('2026-11-05', 12, 1_000);
    expect(invoices).toHaveLength(12);
    for (let i = 1; i < invoices.length; i++) {
      const previousEnd = invoices[i - 1]!.periodEnd;
      const dayAfter = new Date(`${previousEnd}T00:00:00Z`);
      dayAfter.setUTCDate(dayAfter.getUTCDate() + 1);
      expect(invoices[i]!.periodStart).toBe(dayAfter.toISOString().slice(0, 10));
    }
    expect(invoices.at(-1)?.periodEnd).toBe('2027-11-04');
  });

  it('adds up exactly to term × monthly rent for every term and many rents', () => {
    for (const termMonths of [12, 24, 36, 48]) {
      for (let monthly = 1; monthly <= 2_000_000; monthly = monthly * 3 + 7) {
        const totals = sumInvoices(schedule('2026-03-31', termMonths, monthly));
        expect(totals.netCents).toBe(monthly * termMonths);
        expect(totals.totalCents).toBe(totals.netCents + totals.vatCents);
      }
    }
  });

  it('says when no VAT rate covers an invoice date', () => {
    expect(
      invoiceSchedule({ startDate: '2012-12-15', termMonths: 2, monthlyNetCents: 100 }, vatRates)
    ).toEqual({ ok: false, reason: 'no_vat_rate', dueDate: '2012-12-15' });
  });
});

describe('splitByDate', () => {
  it('counts an invoice as issued from its date on', () => {
    const invoices = schedule('2026-11-05', 36, 10_730);
    const { issued, upcoming } = splitByDate(invoices, '2026-12-05');
    expect(issued.map((i) => i.number)).toEqual([1, 2]);
    expect(upcoming).toHaveLength(34);
  });

  it('has nothing issued before the start, and everything after the end', () => {
    const invoices = schedule('2026-11-05', 12, 100);
    expect(splitByDate(invoices, '2026-11-04').issued).toHaveLength(0);
    expect(splitByDate(invoices, '2030-01-01').issued).toHaveLength(12);
  });
});

describe('upcomingVatChange', () => {
  // From 15 Sep 2026: invoice 5 (15 Jan 2027) is the first at 26 %
  const invoices = () => schedule('2026-09-15', 24, 6_957);

  it('warns about the change while it is still ahead', () => {
    const change = upcomingVatChange(invoices(), '2026-12-20');
    expect(change?.invoice).toMatchObject({ number: 5, vatPercent: 26 });
    expect(change?.previous).toMatchObject({ number: 4, vatPercent: 25.5 });
  });

  it('still warns the day before the first new-rate invoice', () => {
    expect(upcomingVatChange(invoices(), '2027-01-14')?.invoice.number).toBe(5);
  });

  it('stops warning once the first new-rate invoice is issued', () => {
    expect(upcomingVatChange(invoices(), '2027-01-15')).toBeNull();
    expect(upcomingVatChange(invoices(), '2028-01-01')).toBeNull();
  });

  it('has nothing to warn about when the rate never changes', () => {
    expect(upcomingVatChange(schedule('2027-02-01', 12, 1_000), '2027-02-01')).toBeNull();
  });
});

describe('withStatus', () => {
  const invoices = () => schedule('2026-11-05', 12, 1_000);

  it('is upcoming before the invoice date, due from it, and paid once paid', () => {
    const statuses = withStatus(
      invoices(),
      [{ invoiceNumber: 1, paidDate: '2026-11-06' }],
      '2026-12-05'
    );
    expect(statuses.slice(0, 3).map((i) => [i.number, i.status, i.paidDate])).toEqual([
      [1, 'paid', '2026-11-06'],
      [2, 'due', null],
      [3, 'upcoming', null],
    ]);
  });

  it('keeps every invoice upcoming before the lease starts', () => {
    expect(withStatus(invoices(), [], '2026-11-04').every((i) => i.status === 'upcoming')).toBe(
      true
    );
  });
});

describe('invoiceLabel', () => {
  it('joins the contract number and a two-digit month', () => {
    expect(invoiceLabel('1A2B3C4D', 5)).toBe('1A2B3C4D-05');
    expect(invoiceLabel('1A2B3C4D', 48)).toBe('1A2B3C4D-48');
  });
});
