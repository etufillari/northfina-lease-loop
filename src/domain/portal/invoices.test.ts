import { describe, expect, it } from 'vitest';
import { buildSchedule, contractBalanceOn } from '../invoicing';
import { invoiceStatusSchema } from '../statuses';
import { pack, quoteFor } from '../scenarios/fixtures';
import { groupInvoices, type PortalInvoice } from './invoices';

const deal = { assetId: 'ebike-003', termMonths: 36, isoDate: '2026-11-05' };

/** Card 1's 36 rents as the invoice table holds them on signing: all `issued`, none paid. */
function cardOneInvoices(): PortalInvoice[] {
  const q = quoteFor(deal);
  if (!q.ok) throw new Error(q.reason.code);
  const s = buildSchedule({
    signedOn: deal.isoDate,
    startDate: deal.isoDate,
    termMonths: 36,
    downPaymentCents: 0,
    monthlyNetCents: q.quote.monthlyNetCents,
    vatRates: pack.vatRates,
  });
  if (!s.ok) throw new Error(s.reason);
  return s.invoices.map((i) => ({
    id: `inv-${i.sequence}`,
    issueDate: i.issueDate,
    dueDate: i.dueDate,
    grossCents: i.grossCents,
    status: 'issued',
    paidOn: null,
  }));
}

/** Card 8: card 1's first seven rents paid, the other 29 cancelled, the exit invoice issued and
 * due on 5 Jun 2027; `exitPaidOn` pays it. */
function cardEight(exitPaidOn: string | null): PortalInvoice[] {
  return [
    ...cardOneInvoices().map((i, index) =>
      index < 7 ? { ...i, status: 'paid', paidOn: i.dueDate } : { ...i, status: 'cancelled' }
    ),
    {
      id: 'inv-exit',
      issueDate: '2027-06-05',
      dueDate: '2027-06-05',
      grossCents: 416_651,
      status: exitPaidOn ? 'paid' : 'issued',
      paidOn: exitPaidOn,
    },
  ];
}

const invoice = (over: Partial<PortalInvoice> & { id: string }): PortalInvoice => ({
  issueDate: '2026-11-05',
  dueDate: '2026-11-05',
  grossCents: 1_000,
  status: 'issued',
  paidOn: null,
  ...over,
});

describe('groupInvoices', () => {
  it('card 1 on 5 Nov 2026: of the first three invoices one is open, 134.66 €, due that day', () => {
    const first = cardOneInvoices().slice(0, 3);
    const g = groupInvoices(first, '2026-11-05');
    expect(g.open.map((i) => i.id)).toEqual(['inv-1']);
    expect(g.overdue).toEqual([]);
    expect(g.upcoming.map((i) => i.id)).toEqual(['inv-2', 'inv-3']);
    expect(g.openTotalCents).toBe(13_466);
    expect(g.nextDueDate).toBe('2026-11-05');
  });

  it('card 1 on 5 Nov 2026, the whole schedule: still one open invoice, 35 upcoming', () => {
    const g = groupInvoices(cardOneInvoices(), '2026-11-05');
    expect(g.open).toHaveLength(1);
    expect(g.upcoming).toHaveLength(35);
    expect(g.paid).toEqual([]);
    expect(g.openTotalCents).toBe(13_466);
  });

  it('card 1 paid on 5 Nov: nothing open and the next due date is 5 Dec', () => {
    const invoices = cardOneInvoices().map((i) =>
      i.id === 'inv-1' ? { ...i, status: 'paid', paidOn: '2026-11-05' } : i
    );
    const g = groupInvoices(invoices, '2026-11-05');
    expect(g.open).toEqual([]);
    expect(g.paid.map((i) => i.id)).toEqual(['inv-1']);
    expect(g.openTotalCents).toBe(0);
    expect(g.nextDueDate).toBe('2026-12-05');
  });

  it('card 8 after the exit on 5 Jun 2027: seven paid, 29 cancelled, the exit invoice open', () => {
    const g = groupInvoices(cardEight(null), '2027-06-05');
    expect(g.paid).toHaveLength(7);
    expect(g.cancelled).toHaveLength(29);
    expect(g.open.map((i) => i.id)).toEqual(['inv-exit']);
    expect(g.upcoming).toEqual([]);
    expect(g.openTotalCents).toBe(416_651);
    expect(g.nextDueDate).toBe('2027-06-05');
  });

  it('card 8: the open and overdue sums match contractBalanceOn on the exit day and a month later', () => {
    for (const today of ['2027-06-05', '2027-07-06']) {
      const g = groupInvoices(cardEight(null), today);
      const stored = cardEight(null).map((i) => ({
        ...i,
        status: invoiceStatusSchema.parse(i.status),
      }));
      const balance = contractBalanceOn(stored, {}, today);
      expect(g.openTotalCents).toBe(balance.openCents);
      expect(g.overdueTotalCents).toBe(balance.overdueCents);
      expect(g.open.map((i) => i.id)).toEqual(balance.openInvoiceIds);
    }
  });

  it('card 8 once the exit invoice is paid: nothing open, no next due date, 8 paid, 29 cancelled', () => {
    const g = groupInvoices(cardEight('2027-06-05'), '2027-06-05');
    expect(g.openTotalCents).toBe(0);
    expect(g.nextDueDate).toBeNull();
    expect(g.paid).toHaveLength(8);
    expect(g.cancelled).toHaveLength(29);
  });

  it('all cancelled: nothing open, nothing paid, no next due date', () => {
    const g = groupInvoices(
      cardOneInvoices().map((i) => ({ ...i, status: 'cancelled' })),
      '2027-06-05'
    );
    expect(g.cancelled).toHaveLength(36);
    expect(g).toMatchObject({ open: [], upcoming: [], paid: [], openTotalCents: 0 });
    expect(g.nextDueDate).toBeNull();
  });

  it('an overdue invoice beside upcoming ones pins the next due date to the overdue day', () => {
    const g = groupInvoices(cardOneInvoices(), '2026-11-20');
    expect(g.overdue.map((i) => i.id)).toEqual(['inv-1']);
    expect(g.upcoming).toHaveLength(35);
    expect(g.nextDueDate).toBe('2026-11-05');
  });

  it('an unpaid invoice past its due day is open and overdue, and counts in both totals', () => {
    const g = groupInvoices(
      [invoice({ id: 'late', grossCents: 500 }), invoice({ id: 'now', dueDate: '2026-12-01' })],
      '2026-11-20'
    );
    expect(g.open.map((i) => i.id)).toEqual(['late', 'now']);
    expect(g.overdue.map((i) => i.id)).toEqual(['late']);
    expect(g.openTotalCents).toBe(1_500);
    expect(g.overdueTotalCents).toBe(500);
    expect(g.nextDueDate).toBe('2026-11-05');
  });

  it('a payment dated after today does not count yet', () => {
    const g = groupInvoices(
      [invoice({ id: 'x', status: 'paid', paidOn: '2026-11-10' })],
      '2026-11-05'
    );
    expect(g.open.map((i) => i.id)).toEqual(['x']);
  });

  it('keeps the input order inside each group', () => {
    const g = groupInvoices(cardOneInvoices().slice(0, 3).reverse(), '2027-01-10');
    expect(g.overdue.map((i) => i.id)).toEqual(['inv-3', 'inv-2', 'inv-1']);
  });

  it('handles an empty list', () => {
    const g = groupInvoices([], '2026-11-05');
    expect(g).toMatchObject({ open: [], paid: [], openTotalCents: 0, nextDueDate: null });
  });

  it('rejects a status that is not an invoice status and a day that is not a day', () => {
    expect(() => groupInvoices([invoice({ id: 'x', status: 'void' })], '2026-11-05')).toThrow();
    expect(() => groupInvoices([], '2026-02-30')).toThrow(RangeError);
  });

  it('rejects an amount that is not whole cents', () => {
    expect(() => groupInvoices([invoice({ id: 'x', grossCents: 10.5 })], '2026-11-05')).toThrow(
      RangeError
    );
  });
});
