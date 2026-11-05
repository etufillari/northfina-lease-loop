import fc from 'fast-check';
import { beforeAll, describe, expect, it } from 'vitest';
import { loadCoefficientTable, loadVatRates } from '@/data/load';
import type { CoefficientTable, VatRates } from '@/data/schemas';
import { addDays } from './calendar';
import { billedBefore, invoiceSchedule, vatSteps, type InvoicedContract } from './invoicing';
import { downPaymentBounds, quoteLease } from './pricing';

let vatRates: VatRates;
beforeAll(async () => {
  vatRates = await loadVatRates();
});

const contract = (overrides: Partial<InvoicedContract> = {}): InvoicedContract => ({
  startDate: '2026-11-05',
  termMonths: 36,
  monthlyNetRentCents: 10_730,
  downPaymentCents: 0,
  billing: 'start_day_full_months',
  ...overrides,
});

function scheduleOf(c: InvoicedContract) {
  const result = invoiceSchedule(c, vatRates);
  if (!result.ok) throw new Error(`no schedule: ${result.reason}`);
  return result;
}

describe('invoiceSchedule, start-day billing in full months', () => {
  it('bills once per month of the term, the first on the start date, in advance', () => {
    const { invoices } = scheduleOf(contract());
    expect(invoices).toHaveLength(36);
    expect(invoices[0]).toMatchObject({
      number: 1,
      invoiceDate: '2026-11-05',
      periodStart: '2026-11-05',
      periodEnd: '2026-12-04',
    });
    expect(invoices[35]).toMatchObject({ number: 36, invoiceDate: '2029-10-05' });
  });

  it('charges VAT at the rate on each invoice date, so the gross changes on 1 Jan 2027', () => {
    // 10 730 net: 25.5 % → 2 736.15 → 2 736 (gross 13 466); 26 % → 2 789.8 → 2 790 (gross 13 520).
    const { invoices } = scheduleOf(contract());
    expect(invoices[1]).toMatchObject({
      invoiceDate: '2026-12-05',
      vatRatePercent: 25.5,
      vatCents: 2_736,
      grossCents: 13_466,
    });
    expect(invoices[2]).toMatchObject({
      invoiceDate: '2027-01-05',
      vatRatePercent: 26,
      vatCents: 2_790,
      grossCents: 13_520,
    });
  });

  it('adds the totals from the invoices themselves', () => {
    // 36 × 10 730 = 386 280 net. VAT: 2 invoices × 2 736 + 34 × 2 790 = 5 472 + 94 860 = 100 332.
    expect(scheduleOf(contract()).totals).toEqual({
      netCents: 386_280,
      vatCents: 100_332,
      grossCents: 486_612,
    });
  });

  it('bills a 31st start on the last day of short months and returns to the 31st', () => {
    const { invoices } = scheduleOf(contract({ startDate: '2026-01-31' }));
    expect(invoices.slice(0, 4).map((i) => i.invoiceDate)).toEqual([
      '2026-01-31',
      '2026-02-28',
      '2026-03-31',
      '2026-04-30',
    ]);
    // Period 2 runs from 28 Feb up to the day before the next invoice.
    expect(invoices[1]).toMatchObject({ periodStart: '2026-02-28', periodEnd: '2026-03-30' });
  });

  it('issues no down-payment invoice when there is no down payment', () => {
    expect(scheduleOf(contract()).downPayment).toBeNull();
  });

  it('reports a missing VAT rate instead of inventing one', () => {
    expect(invoiceSchedule(contract({ startDate: '2012-06-01' }), vatRates)).toEqual({
      ok: false,
      reason: 'no_vat_rate',
      invoiceDate: '2012-06-01',
    });
  });
});

describe('invoiceSchedule, the down payment as invoice 0', () => {
  const withDown = contract({ downPaymentCents: 50_000 });

  it('bills the down payment on the start date as invoice 0, for the whole term', () => {
    // 500 € net on 5 Nov 2026 at 25.5 %: 50 000 × 0.255 = 12 750 VAT, gross 62 750.
    // The term's last day is the day before 5 Nov 2029.
    expect(scheduleOf(withDown).downPayment).toEqual({
      number: 0,
      invoiceDate: '2026-11-05',
      periodStart: '2026-11-05',
      periodEnd: '2029-11-04',
      vatRatePercent: 25.5,
      netCents: 50_000,
      vatCents: 12_750,
      grossCents: 62_750,
    });
  });

  it('keeps the monthly invoices numbered 1…n and unchanged', () => {
    const { invoices } = scheduleOf(withDown);
    expect(invoices).toEqual(scheduleOf(contract()).invoices);
    expect(invoices.map((i) => i.number)).toEqual(Array.from({ length: 36 }, (_, i) => i + 1));
  });

  it('adds the down payment to the totals, so they match the contract total cost', () => {
    // Rents as above: 386 280 net, 100 332 VAT. Plus 50 000 net, 12 750 VAT.
    // Net 436 280 = contract total cost (down + 36 × 10 730); VAT 113 082; gross 549 362.
    expect(scheduleOf(withDown).totals).toEqual({
      netCents: 436_280,
      vatCents: 113_082,
      grossCents: 549_362,
    });
  });

  it('charges the VAT valid on the start date: 26 % for a 2027 start', () => {
    // 100 € net on 1 Mar 2027: 10 000 × 0.26 = 2 600 VAT.
    const { downPayment } = scheduleOf(
      contract({ startDate: '2027-03-01', termMonths: 12, downPaymentCents: 10_000 })
    );
    expect(downPayment).toMatchObject({
      invoiceDate: '2027-03-01',
      periodEnd: '2028-02-29',
      vatRatePercent: 26,
      vatCents: 2_600,
      grossCents: 12_600,
    });
  });
});

describe('invoiceSchedule properties (thousands of random contracts)', () => {
  // Any day from the 24 % era to well past the 2027 change, any term, any rent up to 10 000 €.
  const day = fc.integer({ min: 0, max: 365 * 6 }).map((offset) => addDays('2024-09-01', offset));
  const anyContract = fc.record({
    startDate: day,
    termMonths: fc.constantFrom(12, 24, 36, 48),
    monthlyNetRentCents: fc.integer({ min: 1, max: 1_000_000 }),
    downPaymentCents: fc.oneof(fc.constant(0), fc.integer({ min: 1, max: 1_000_000 })),
    billing: fc.constant('start_day_full_months' as const),
  });

  it('has one invoice per month, in order, covering the term without gaps or overlaps', () => {
    fc.assert(
      fc.property(anyContract, (c) => {
        const { invoices } = scheduleOf(c);
        expect(invoices).toHaveLength(c.termMonths);
        expect(invoices[0]?.periodStart).toBe(c.startDate);
        invoices.forEach((invoice, i) => {
          expect(invoice.number).toBe(i + 1);
          expect(invoice.invoiceDate).toBe(invoice.periodStart);
          expect(invoice.periodStart <= invoice.periodEnd).toBe(true);
          const next = invoices[i + 1];
          if (next) expect(addDays(invoice.periodEnd, 1)).toBe(next.periodStart);
        });
      })
    );
  });

  it('adds up exactly: net total = down payment + rent × term, and every gross = net + VAT', () => {
    fc.assert(
      fc.property(anyContract, (c) => {
        const schedule = scheduleOf(c);
        const { totals } = schedule;
        const invoices = schedule.downPayment
          ? [schedule.downPayment, ...schedule.invoices]
          : schedule.invoices;
        expect(schedule.downPayment === null).toBe(c.downPaymentCents === 0);
        const sum = (pick: (i: (typeof invoices)[number]) => number) =>
          invoices.reduce((total, invoice) => total + pick(invoice), 0);
        expect(totals.netCents).toBe(c.downPaymentCents + c.monthlyNetRentCents * c.termMonths);
        expect(sum((i) => i.netCents)).toBe(totals.netCents);
        expect(sum((i) => i.vatCents)).toBe(totals.vatCents);
        expect(totals.grossCents).toBe(totals.netCents + totals.vatCents);
        for (const invoice of invoices) {
          expect(Number.isInteger(invoice.vatCents)).toBe(true);
          expect(invoice.grossCents).toBe(invoice.netCents + invoice.vatCents);
        }
      })
    );
  });

  it('charges 25.5 % on invoices dated in 2026 or earlier (from Sep 2024) and 26 % from 2027', () => {
    fc.assert(
      fc.property(anyContract, (c) => {
        const { downPayment, invoices } = scheduleOf(c);
        for (const invoice of downPayment ? [downPayment, ...invoices] : invoices) {
          const expected = invoice.invoiceDate >= '2027-01-01' ? 26 : 25.5;
          expect(invoice.vatRatePercent).toBe(expected);
        }
      })
    );
  });
});

describe('vatSteps, the monthly totals that change during the term', () => {
  it('shows card 1 that from 1 Jan 2027 the month costs 135.20 €, first billed on 5 Jan', () => {
    // 10 730 net at 26 %: 2 789.8 → 2 790 VAT, gross 13 520. Nov and Dec 2026 are 13 466.
    expect(vatSteps(scheduleOf(contract()), vatRates)).toEqual([
      {
        validFrom: '2027-01-01',
        firstInvoiceDate: '2027-01-05',
        vatRatePercent: 26,
        netCents: 10_730,
        vatCents: 2_790,
        grossCents: 13_520,
      },
    ]);
  });

  it('has no steps when the whole term is billed at one rate', () => {
    // 12 months from 1 Jan 2027: every invoice at 26 %.
    expect(
      vatSteps(scheduleOf(contract({ startDate: '2027-01-01', termMonths: 12 })), vatRates)
    ).toEqual([]);
  });

  it('shows both changes for a term across Sep 2024 and Jan 2027', () => {
    // 1 Aug 2024 start, 36 months: 24 % in Aug 2024, 25.5 % from 1 Sep 2024, 26 % from 2027.
    const steps = vatSteps(scheduleOf(contract({ startDate: '2024-08-01' })), vatRates);
    expect(steps.map((s) => [s.validFrom, s.firstInvoiceDate, s.vatRatePercent])).toEqual([
      ['2024-09-01', '2024-09-01', 25.5],
      ['2027-01-01', '2027-01-01', 26],
    ]);
  });

  it('ignores the down payment: only monthly rents are steps', () => {
    expect(vatSteps(scheduleOf(contract({ downPaymentCents: 50_000 })), vatRates)).toHaveLength(1);
  });
});

describe('billedBefore, the invoices a lease issued before it ended', () => {
  it('keeps months 1–7 of card 8 and cancels the 29 still to come', () => {
    // Card 8: Aino's card 1 lease ends early in month 7, effective 5 Jun 2027 (D-033).
    const billed = billedBefore(scheduleOf(contract()), '2027-06-05');
    expect(billed.invoices.map((i) => i.number)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(billed.cancelledCount).toBe(29);
    // Net 7 × 10 730 = 75 110. VAT: Nov and Dec 2026 at 25.5 % (2 736.15 → 2 736 each),
    // Jan–May 2027 at 26 % (2 789.8 → 2 790 each): 2 × 2 736 + 5 × 2 790 = 19 422.
    expect(billed.totals).toEqual({ netCents: 75_110, vatCents: 19_422, grossCents: 94_532 });
  });

  it('cancels the invoice dated on the ending day: that month is settled by the ending', () => {
    // 31 Jan start, ending effective 31 Mar 2026: invoices on 31 Jan and 28 Feb only.
    const billed = billedBefore(
      scheduleOf(contract({ startDate: '2026-01-31', termMonths: 12 })),
      '2026-03-31'
    );
    expect(billed.invoices.map((i) => i.invoiceDate)).toEqual(['2026-01-31', '2026-02-28']);
    expect(billed.cancelledCount).toBe(10);
  });

  it('keeps every invoice when the lease runs its full term (handover after the last one)', () => {
    // D-029: card 1 hands over on 5 Nov 2029; the last invoice is dated 5 Oct 2029.
    const full = scheduleOf(contract());
    const billed = billedBefore(full, '2029-11-05');
    expect(billed.invoices).toHaveLength(36);
    expect(billed.cancelledCount).toBe(0);
    expect(billed.totals).toEqual(full.totals);
  });

  it('issues every invoice while the lease has not ended', () => {
    const full = scheduleOf(contract());
    expect(billedBefore(full, null)).toEqual({
      downPayment: null,
      invoices: full.invoices,
      totals: full.totals,
      cancelledCount: 0,
    });
  });

  it('keeps the down payment of a lease that ends early: it was billed at the start', () => {
    // Card 8 with 500 € down: months 1–7 as above (75 110 net, 19 422 VAT) plus invoice 0
    // (50 000 net, 12 750 VAT): 125 110 net, 32 172 VAT, gross 157 282.
    const billed = billedBefore(scheduleOf(contract({ downPaymentCents: 50_000 })), '2027-06-05');
    expect(billed.downPayment?.number).toBe(0);
    expect(billed.cancelledCount).toBe(29);
    expect(billed.totals).toEqual({ netCents: 125_110, vatCents: 32_172, grossCents: 157_282 });
  });

  it('cancels everything for an ending on the start date', () => {
    const billed = billedBefore(scheduleOf(contract()), '2026-11-05');
    expect(billed.invoices).toEqual([]);
    expect(billed.cancelledCount).toBe(36);
    expect(billed.totals).toEqual({ netCents: 0, vatCents: 0, grossCents: 0 });
  });

  it('cancels the down payment too when the ending is on the start date (same rule)', () => {
    const billed = billedBefore(scheduleOf(contract({ downPaymentCents: 50_000 })), '2026-11-05');
    expect(billed.downPayment).toBeNull();
    // 36 rents + invoice 0.
    expect(billed.cancelledCount).toBe(37);
  });
});

describe('a signed contract and its invoices agree (random quotes from the real table)', () => {
  let table: CoefficientTable;
  beforeAll(async () => {
    table = await loadCoefficientTable();
  });

  // Any list price from 300 € to 300 000 €, any term the table has, any step of down payment.
  const anyLease = fc.record({
    listPriceCents: fc.integer({ min: 30_000, max: 30_000_000 }),
    termMonths: fc.constantFrom(12, 24, 36, 48),
    downShare: fc.double({ min: 0, max: 1, noNaN: true }),
    startDate: fc.integer({ min: 0, max: 365 * 4 }).map((offset) => addDays('2025-01-01', offset)),
  });

  it('schedule net total = the contract total cost (down payment + all rents)', () => {
    fc.assert(
      fc.property(anyLease, (lease) => {
        const bounds = downPaymentBounds(table, lease.listPriceCents);
        fc.pre(bounds.ok);
        if (!bounds.ok) return;
        const steps = (bounds.maxCents - bounds.minCents) / bounds.stepCents;
        const downPaymentCents =
          bounds.minCents + Math.floor(steps * lease.downShare) * bounds.stepCents;
        const quote = quoteLease(table, {
          listPriceCents: lease.listPriceCents,
          termMonths: lease.termMonths,
          downPaymentCents,
        });
        if (!quote.ok) throw new Error(quote.reason);
        const { totals } = scheduleOf({
          startDate: lease.startDate,
          termMonths: lease.termMonths,
          monthlyNetRentCents: quote.monthlyNetRentCents,
          downPaymentCents,
          billing: 'start_day_full_months',
        });
        expect(totals.netCents).toBe(quote.totalNetCostCents);
      })
    );
  });
});
