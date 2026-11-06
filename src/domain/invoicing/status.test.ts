import { describe, expect, it } from 'vitest';
import { contractBalanceOn, invoiceStatusOn, type InvoiceForBalance } from './status';

const rent = (id: string, day: string, grossCents: number, paidOn: string | null = null) =>
  ({
    id,
    issueDate: day,
    dueDate: day,
    grossCents,
    paidOn,
    status: paidOn === null ? 'issued' : 'paid',
  }) satisfies InvoiceForBalance;

describe('invoiceStatusOn', () => {
  const invoice = { issueDate: '2026-12-05', dueDate: '2026-12-05', paidOn: null };

  it('is upcoming the day before, due on the day and overdue the day after', () => {
    expect(invoiceStatusOn(invoice, '2026-12-04')).toBe('upcoming');
    expect(invoiceStatusOn(invoice, '2026-12-05')).toBe('due');
    expect(invoiceStatusOn(invoice, '2026-12-06')).toBe('overdue');
  });

  it('is paid once paid, even late', () => {
    expect(invoiceStatusOn({ ...invoice, paidOn: '2027-01-20' }, '2027-02-01')).toBe('paid');
  });

  it('is due through a later due date when issue and due differ', () => {
    const withTerms = { issueDate: '2026-12-01', dueDate: '2026-12-15', paidOn: null };
    expect(invoiceStatusOn(withTerms, '2026-12-15')).toBe('due');
    expect(invoiceStatusOn(withTerms, '2026-12-16')).toBe('overdue');
  });

  it('throws on a malformed today', () => {
    expect(() => invoiceStatusOn(invoice, '5.12.2026')).toThrow(RangeError);
  });
});

describe('contractBalanceOn', () => {
  // Card 1's first three invoices.
  const invoices = [
    rent('i1', '2026-11-05', 13_466, '2026-11-05'),
    rent('i2', '2026-12-05', 13_466),
    rent('i3', '2027-01-05', 13_520),
  ];

  it('splits paid, overdue and upcoming on 2026-12-20', () => {
    expect(contractBalanceOn(invoices, {}, '2026-12-20')).toEqual({
      openCents: 13_466,
      overdueCents: 13_466,
      upcomingCents: 13_520,
      paidCents: 13_466,
      openInvoiceIds: ['i2'],
      overdueInvoiceIds: ['i2'],
    });
  });

  it('counts a payment passed in, but not one dated after today', () => {
    expect(contractBalanceOn(invoices, { i2: '2026-12-10' }, '2026-12-20').openCents).toBe(0);
    expect(contractBalanceOn(invoices, { i2: '2026-12-25' }, '2026-12-20').openCents).toBe(13_466);
  });

  it('skips a cancelled rent: an early exit replaced it, so it owes nothing (D35)', () => {
    const withCancelled = [
      ...invoices,
      { ...rent('i4', '2027-02-05', 13_520), status: 'cancelled' as const },
    ];
    const result = contractBalanceOn(withCancelled, {}, '2027-03-01');
    expect(result).toEqual({
      openCents: 13_466 + 13_520,
      overdueCents: 13_466 + 13_520,
      upcomingCents: 0,
      paidCents: 13_466,
      openInvoiceIds: ['i2', 'i3'],
      overdueInvoiceIds: ['i2', 'i3'],
    });
  });

  it('shows an invoice due today as open but not overdue', () => {
    const result = contractBalanceOn(invoices, {}, '2027-01-05');
    expect(result.openInvoiceIds).toEqual(['i2', 'i3']);
    expect(result.overdueInvoiceIds).toEqual(['i2']);
  });

  it('is all zero for no invoices', () => {
    expect(contractBalanceOn([], {}, '2026-12-20')).toMatchObject({ openCents: 0, paidCents: 0 });
  });
});
