// Card 1, the happy path: Aino leases `ebike-003` for 36 months with no down payment, quoted
// and signed on 5 Nov 2026. The rent, its VAT, the first invoices, the January 2027 rate
// change and the total the invoices add up to.
import { describe, expect, it } from 'vitest';
import { buildSchedule, scheduleTotals } from '../invoicing';
import { applyFor, customerById, pack, quoteFor } from './fixtures';

const deal = { assetId: 'ebike-003', termMonths: 36, isoDate: '2026-11-05' };

function quote() {
  const q = quoteFor(deal);
  if (!q.ok) throw new Error(`card 1 does not price: ${q.reason.code}`);
  return q.quote;
}

function schedule() {
  const q = quote();
  const s = buildSchedule({
    signedOn: deal.isoDate,
    startDate: deal.isoDate,
    termMonths: q.termMonths,
    downPaymentCents: q.downPaymentCents,
    monthlyNetCents: q.monthlyNetCents,
    vatRates: pack.vatRates,
  });
  if (!s.ok) throw new Error(`card 1 has no schedule: ${s.reason}`);
  return s.invoices;
}

describe('card 1: the happy path (ebike-003, 36 months, 5 Nov 2026)', () => {
  it('prices band B, factor 27 584 millionths, net 10 730, VAT 2 736, gross 13 466, buyout 58 350', () => {
    expect(quote()).toMatchObject({
      priceListVersion: 1,
      listPriceCents: 389_000,
      financedCents: 389_000,
      band: 'B',
      factorMillionths: 27_584,
      monthlyNetCents: 10_730,
      vatRateBasisPoints: 2_550,
      monthlyVatCents: 2_736,
      monthlyGrossCents: 13_466,
      buyoutCents: 58_350,
    });
  });

  it('bills the first three invoices on 5 Nov, 5 Dec and 5 Jan: 13 466, 13 466, then 13 520 at 26 %', () => {
    const invoices = schedule();
    const first = invoices
      .slice(0, 3)
      .map((i) => [i.sequence, i.issueDate, i.dueDate, i.netCents, i.vatCents, i.grossCents]);
    expect(first).toEqual([
      [1, '2026-11-05', '2026-11-05', 10_730, 2_736, 13_466],
      [2, '2026-12-05', '2026-12-05', 10_730, 2_736, 13_466],
      [3, '2027-01-05', '2027-01-05', 10_730, 2_790, 13_520],
    ]);
    expect(invoices[2]?.vatRateBasisPoints).toBe(2_600);
  });

  it('has no invoice 0 (no down payment) and 36 rents, the last for Oct to Nov 2029', () => {
    const invoices = schedule();
    expect(invoices).toHaveLength(36);
    expect(invoices.every((i) => i.kind === 'rent')).toBe(true);
    expect(invoices.at(-1)).toMatchObject({ periodStart: '2029-10-05', periodEnd: '2029-11-04' });
  });

  it('the invoices add up exactly to the contract total: 386 280 net + 100 332 VAT = 486 612', () => {
    const invoices = schedule();
    const totals = scheduleTotals(invoices);
    expect(totals.netCents).toBe(quote().monthlyNetCents * 36);
    expect(totals).toEqual({ netCents: 386_280, vatCents: 100_332, grossCents: 486_612 });
    expect(totals.grossCents).toBe(totals.netCents + totals.vatCents);
    expect(invoices.reduce((sum, i) => sum + i.grossCents, 0)).toBe(totals.grossCents);
  });

  it('the quote total at the quote-day rate is an estimate the 2027 rate moves by 34 × 54 cents', () => {
    const q = quote();
    expect(q.vatIsEstimate).toBe(true);
    expect(q.totalIfReturnCents).toBe(484_776);
    expect(scheduleTotals(schedule()).grossCents - q.totalIfReturnCents).toBe(34 * 54);
    // The buyout carries its VAT at the quote-day rate: 58 350 + 14 879.
    expect(q.buyoutGrossCents).toBe(73_229);
    expect(q.totalIfBuyCents).toBe(558_005);
  });

  it('Aino is approved', () => {
    const app = applyFor(customerById('cust-aino'), deal);
    expect(app.ok && app.result).toEqual({
      decision: 'approved',
      reasons: [{ code: 'all_checks_passed', params: {} }],
    });
  });
});
