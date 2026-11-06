import { describe, expect, it } from 'vitest';
import { invoicesDue, type BillableContract } from './invoice-issuance';

const rates = [
  { valid_from: '2024-09-01', valid_to: '2026-12-31', rate_percent: 25.5 },
  { valid_from: '2027-01-01', valid_to: null, rate_percent: 26 },
];

// Scenario card 1: Aino, ebike-003, 36 months, signed 5 Nov 2026.
const aino: BillableContract = {
  status: 'active',
  startDate: '2026-11-05',
  termMonths: 36,
  monthlyNetCents: 10730,
  isDemo: false,
};

const due = (contract: BillableContract, today: string, issued: string[] = []) => {
  const result = invoicesDue(contract, today, rates, issued);
  if (!result.ok) throw new Error(result.reason);
  return result.invoices;
};

describe('invoicesDue', () => {
  it('issues card 1 from the locked rent, with VAT for each due date (25.5 % → 26 %)', () => {
    const invoices = due(aino, '2027-01-05');
    expect(invoices.map((invoice) => invoice.dueDate)).toEqual([
      '2026-11-05',
      '2026-12-05',
      '2027-01-05',
    ]);
    expect(invoices[0]).toMatchObject({
      netCents: 10730,
      vatBasisPoints: 2550,
      vatCents: 2736,
      totalCents: 13466,
    });
    expect(invoices[2]).toMatchObject({
      netCents: 10730,
      vatBasisPoints: 2600,
      vatCents: 2790,
      totalCents: 13520,
    });
  });

  it('issues an invoice on its due date, not the day before', () => {
    expect(due(aino, '2026-11-04')).toEqual([]);
    expect(due(aino, '2026-11-05')).toHaveLength(1);
    expect(due(aino, '2026-12-04')).toHaveLength(1);
  });

  it('keeps card 4 due dates on month ends, including the leap-year February', () => {
    const laptop = { ...aino, startDate: '2026-01-31' };
    const dates = due(laptop, '2028-03-01').map((invoice) => invoice.dueDate);
    expect(dates).toContain('2026-02-28');
    expect(dates).toContain('2028-02-29');
    expect(dates).toContain('2026-04-30');
  });

  it('skips invoices already issued, so issuing again creates nothing', () => {
    const first = due(aino, '2027-01-05').map((invoice) => invoice.dueDate);
    expect(due(aino, '2027-01-05', first)).toEqual([]);
    expect(due(aino, '2027-02-05', first).map((invoice) => invoice.dueDate)).toEqual([
      '2027-02-05',
    ]);
  });

  it('stops after the last month of the term', () => {
    const short = { ...aino, termMonths: 3 };
    expect(due(short, '2030-01-01').map((invoice) => invoice.dueDate)).toEqual([
      '2026-11-05',
      '2026-12-05',
      '2027-01-05',
    ]);
    expect(due(aino, '2035-01-01')).toHaveLength(36);
  });

  it('bills only active contracts', () => {
    for (const status of ['awaiting_signature', 'returned', 'bought', 'completed'])
      expect(due({ ...aino, status }, '2027-01-05')).toEqual([]);
  });

  it('marks overdue invoices paid only on demo leases, never the one due today', () => {
    expect(due(aino, '2026-12-05').every((invoice) => !invoice.paid)).toBe(true);
    expect(due({ ...aino, isDemo: true }, '2026-12-05').map((invoice) => invoice.paid)).toEqual([
      true,
      false,
    ]);
  });

  it('reports a missing VAT rate for a due date instead of guessing', () => {
    const early = { ...aino, startDate: '2024-07-01' };
    expect(invoicesDue(early, '2024-10-01', rates, [])).toEqual({
      ok: false,
      reason: 'missing_vat_rate',
    });
    // Future months with no known rate don't matter until they are due.
    const knownTo2026 = invoicesDue(aino, '2026-12-05', rates.slice(0, 1), []);
    expect(knownTo2026.ok && knownTo2026.invoices).toHaveLength(2);
  });

  it('rejects an invalid term', () => {
    expect(() => invoicesDue({ ...aino, termMonths: 0 }, '2027-01-05', rates, [])).toThrow();
  });
});
