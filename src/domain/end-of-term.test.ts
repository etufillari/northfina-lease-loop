import { beforeAll, describe, expect, it } from 'vitest';
import { loadVatRates } from '@/data/load';
import type { VatRates } from '@/data/schemas';
import { buyoutQuote, endOfTermChoice } from './end-of-term';
import { invoiceSchedule, withStatus } from './invoicing';

let vatRates: VatRates;
beforeAll(async () => {
  vatRates = await loadVatRates();
});

// A 12-month lease signed 5 Nov 2026: last day 4 Nov 2027
const lease = { status: 'active', startDate: '2026-11-05', endDate: '2027-11-04' };

function invoices(paidNumbers: number[], today: string) {
  const schedule = invoiceSchedule(
    { startDate: lease.startDate, termMonths: 12, monthlyNetCents: 1_000 },
    vatRates
  );
  if (!schedule.ok) throw new Error(schedule.reason);
  return withStatus(
    schedule.invoices,
    paidNumbers.map((invoiceNumber) => ({ invoiceNumber, paidDate: '2027-11-01' })),
    today,
    lease.startDate
  );
}

const allPaid = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

describe('buyoutQuote', () => {
  it('adds VAT at the rate on the buying day: ebike-003 after 36 months', () => {
    // 15 % of 389000 = 58350 net; at 26 % (2029) VAT is 15171 → 73521
    expect(buyoutQuote(58_350, vatRates, '2029-11-05')).toEqual({
      netCents: 58_350,
      vatPercent: 26,
      vatCents: 15_171,
      totalCents: 73_521,
    });
  });

  it('has no quote when no VAT rate covers the day', () => {
    expect(buyoutQuote(58_350, vatRates, '2010-01-01')).toBeNull();
  });
});

describe('endOfTermChoice', () => {
  it('cannot decide while the lease runs, even on its last day', () => {
    expect(endOfTermChoice(lease, invoices(allPaid, '2027-11-04'), '2027-11-04')).toMatchObject({
      canDecide: false,
      reason: 'not_ended',
      canBuy: false,
    });
  });

  it('can buy from the day after the last day when every invoice is paid', () => {
    expect(endOfTermChoice(lease, invoices(allPaid, '2027-11-05'), '2027-11-05')).toEqual({
      canDecide: true,
      reason: null,
      unpaidCount: 0,
      unpaidCents: 0,
      canBuy: true,
    });
  });

  it('can return or pass on, but not buy, with invoices still open', () => {
    const choice = endOfTermChoice(lease, invoices([2, 3], '2027-11-05'), '2027-11-05');
    expect(choice).toMatchObject({ canDecide: true, canBuy: false, unpaidCount: 9 });
    expect(choice.unpaidCents).toBeGreaterThan(0);
  });

  it('cannot decide twice', () => {
    for (const status of ['returned', 'bought', 'passed_on']) {
      expect(
        endOfTermChoice({ ...lease, status }, invoices(allPaid, '2028-01-01'), '2028-01-01')
      ).toMatchObject({ canDecide: false, reason: 'already_decided' });
    }
  });
});
