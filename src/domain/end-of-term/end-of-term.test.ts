import { beforeAll, describe, expect, it } from 'vitest';
import { invoiceSchema } from '@/data/lease-schemas';
import { loadVatRates } from '@/data/load';
import type { VatRates } from '@/data/schemas';
import {
  assetStatusAfter,
  buyoutInvoice,
  choiceDeadline,
  endChoice,
  endProblem,
} from './end-of-term';

let vatRates: VatRates;
beforeAll(async () => {
  vatRates = await loadVatRates();
});

/** Card 1: its planned end is 4 Nov 2029, so the window closes on 11 Nov 2029. */
const contract = {
  id: 'con-1',
  customer_id: 'cust-aino',
  status: 'active' as const,
  planned_end_on: '2029-11-04',
  term_months: 36,
  buyout_cents: 58_350,
};

describe('choiceDeadline', () => {
  it('is 7 days after the planned end', () => {
    expect(choiceDeadline(contract)).toBe('2029-11-11');
  });

  it('crosses a month and a year end', () => {
    expect(choiceDeadline({ planned_end_on: '2029-12-28' })).toBe('2030-01-04');
  });
});

describe('endChoice', () => {
  it.each([
    ['the day before the planned end', '2029-11-03', 'not_due'],
    ['the planned end', '2029-11-04', 'open'],
    ['mid-window', '2029-11-08', 'open'],
    ['the last day of the window', '2029-11-11', 'open'],
    ['the day after the window', '2029-11-12', 'expired'],
    ['years later', '2035-01-01', 'expired'],
  ])('on %s', (_name, today, expected) => {
    expect(endChoice(contract, today)).toBe(expected);
  });

  it.each(['bought_out', 'returned', 'passed_on', 'exited_early'] as const)(
    'is closed for a %s contract, whatever the date',
    (status) => {
      expect(endChoice({ ...contract, status }, '2029-11-08')).toBe('closed');
      expect(endChoice({ ...contract, status }, '2020-01-01')).toBe('closed');
    }
  );
});

describe('endProblem', () => {
  it('lets the customer choose inside the window', () => {
    expect(endProblem(contract, 'cust-aino', '2029-11-04')).toBeNull();
    expect(endProblem(contract, 'cust-aino', '2029-11-11')).toBeNull();
  });

  it('refuses before the term is up', () => {
    expect(endProblem(contract, 'cust-aino', '2029-11-03')).toBe('not_due');
  });

  it('refuses after the window', () => {
    expect(endProblem(contract, 'cust-aino', '2029-11-12')).toBe('window_closed');
  });

  it('refuses a contract that has already ended', () => {
    const ended = { ...contract, status: 'returned' as const };
    expect(endProblem(ended, 'cust-aino', '2029-11-05')).toBe('already_ended');
  });

  it("refuses someone else's contract before saying anything about it", () => {
    expect(endProblem(contract, 'cust-lena', '2029-11-05')).toBe('not_owner');
    const ended = { ...contract, status: 'returned' as const };
    expect(endProblem(ended, 'cust-lena', '2029-11-05')).toBe('not_owner');
  });
});

describe('assetStatusAfter', () => {
  it('sells the item on a buyout', () => {
    expect(assetStatusAfter('bought_out')).toBe('sold');
  });

  it.each(['returned', 'passed_on'] as const)('sends the item back on %s', (outcome) => {
    expect(assetStatusAfter(outcome)).toBe('returned');
  });
});

describe('buyoutInvoice', () => {
  it('follows the last rent invoice, with VAT on the buyout date (card 1)', () => {
    expect(buyoutInvoice(contract, vatRates, '2029-11-05')).toEqual({
      contract_id: 'con-1',
      sequence: 37,
      period_start: '2029-11-05',
      period_end: '2029-11-05',
      invoice_date: '2029-11-05',
      due_date: '2029-11-05',
      net_cents: 58_350,
      vat_rate_basis_points: 2_600,
      vat_cents: 15_171,
      total_cents: 73_521,
      status: 'issued',
    });
  });

  it('uses the rate of the date it is given', () => {
    const invoice = buyoutInvoice(contract, vatRates, '2026-12-31');
    expect(invoice).toMatchObject({ vat_rate_basis_points: 2_550, vat_cents: 14_879 });
  });

  it('matches the invoice schema once it has an id', () => {
    const draft = buyoutInvoice(contract, vatRates, '2029-11-05');
    expect(invoiceSchema.safeParse({ id: 'inv-1', ...draft }).success).toBe(true);
  });

  it('throws if the data has no VAT rate, because that is a bug in the data', () => {
    const noRates: VatRates = { ...vatRates, rates: [] };
    expect(() => buyoutInvoice(contract, noRates, '2029-11-05')).toThrow(RangeError);
  });
});
