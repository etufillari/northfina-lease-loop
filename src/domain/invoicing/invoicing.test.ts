import { beforeAll, describe, expect, it } from 'vitest';
import { invoiceSchema, type Invoice } from '@/data/lease-schemas';
import { loadVatRates } from '@/data/load';
import type { VatRates } from '@/data/schemas';
import { addDays } from '../dates';
import { futureVatCorrections, invoiceSchedule, invoiceTotals } from './invoicing';

let vatRates: VatRates;
beforeAll(async () => {
  vatRates = await loadVatRates();
});

const card1 = {
  id: 'con-1',
  start_on: '2026-11-05',
  term_months: 36,
  down_payment_cents: 0,
  monthly_net_rent_cents: 10_730,
};
const card3 = { ...card1, start_on: '2026-09-15', term_months: 24, monthly_net_rent_cents: 6_957 };
const card4 = { ...card1, start_on: '2026-01-31', monthly_net_rent_cents: 3_432 };

const invoice = (contract: typeof card1, sequence: number) => {
  const found = invoiceSchedule(contract, vatRates).find((i) => i.sequence === sequence);
  if (!found) throw new Error(`no invoice ${sequence}`);
  return found;
};

describe('invoiceSchedule: amounts', () => {
  it('gives the first invoice of card 1', () => {
    expect(invoice(card1, 1)).toEqual({
      contract_id: 'con-1',
      sequence: 1,
      kind: 'rent',
      period_start: '2026-11-05',
      period_end: '2026-12-04',
      invoice_date: '2026-11-05',
      due_date: '2026-11-05',
      net_cents: 10_730,
      vat_rate_basis_points: 2_550,
      vat_cents: 2_736,
      total_cents: 13_466,
      status: 'issued',
    });
  });

  it('keeps the net rent and changes the VAT from January (card 1)', () => {
    expect(invoice(card1, 2)).toMatchObject({ net_cents: 10_730, total_cents: 13_466 });
    expect(invoice(card1, 3)).toMatchObject({
      invoice_date: '2027-01-05',
      net_cents: 10_730,
      vat_rate_basis_points: 2_600,
      vat_cents: 2_790,
      total_cents: 13_520,
    });
  });

  it('shows December and January either side of the VAT change (card 3)', () => {
    expect(invoice(card3, 4)).toMatchObject({
      invoice_date: '2026-12-15',
      vat_rate_basis_points: 2_550,
      vat_cents: 1_774,
      total_cents: 8_731,
    });
    expect(invoice(card3, 5)).toMatchObject({
      invoice_date: '2027-01-15',
      vat_rate_basis_points: 2_600,
      vat_cents: 1_809,
      total_cents: 8_766,
    });
  });

  it('uses the rate on the invoice date for the last day before a change', () => {
    const contract = { ...card1, start_on: '2026-12-31', term_months: 2 };
    expect(invoiceSchedule(contract, vatRates).map((i) => i.vat_rate_basis_points)).toEqual([
      2_550, 2_600,
    ]);
  });

  it('adds up exactly to rent × term', () => {
    const invoices = invoiceSchedule(card1, vatRates);
    expect(invoices.reduce((sum, i) => sum + i.net_cents, 0)).toBe(386_280);
  });

  it('has each total equal to its net plus its VAT', () => {
    for (const i of invoiceSchedule(card1, vatRates)) {
      expect(i.total_cents).toBe(i.net_cents + i.vat_cents);
    }
  });
});

describe('invoiceSchedule: down payment', () => {
  const withDown = { ...card1, down_payment_cents: 50_000, monthly_net_rent_cents: 9_351 };

  it("bills it first, on the start date, with that date's VAT", () => {
    expect(invoice(withDown, 1)).toEqual({
      contract_id: 'con-1',
      sequence: 1,
      kind: 'down_payment',
      period_start: '2026-11-05',
      period_end: '2026-11-05',
      invoice_date: '2026-11-05',
      due_date: '2026-11-05',
      net_cents: 50_000,
      vat_rate_basis_points: 2_550,
      vat_cents: 12_750,
      total_cents: 62_750,
      status: 'issued',
    });
  });

  it('moves the rents along one place, on the same dates', () => {
    const invoices = invoiceSchedule(withDown, vatRates);
    expect(invoices).toHaveLength(37);
    expect(invoice(withDown, 2)).toMatchObject({
      kind: 'rent',
      invoice_date: '2026-11-05',
      net_cents: 9_351,
    });
    expect(invoices.at(-1)).toMatchObject({ sequence: 37, kind: 'rent' });
  });

  it('adds up to exactly the total if returned', () => {
    const invoices = invoiceSchedule(withDown, vatRates);
    expect(invoices.reduce((sum, i) => sum + i.net_cents, 0)).toBe(386_636);
  });

  it('uses the VAT rate on a start date after the change', () => {
    const later = { ...withDown, start_on: '2027-01-05' };
    expect(invoice(later, 1)).toMatchObject({ vat_rate_basis_points: 2_600, vat_cents: 13_000 });
  });

  it('adds no invoice when there is no down payment', () => {
    expect(invoiceSchedule(card1, vatRates).every((i) => i.kind === 'rent')).toBe(true);
  });
});

describe('invoiceSchedule: dates', () => {
  it.each([12, 24, 36, 48])('creates one invoice per month of a %i month term', (term) => {
    const invoices = invoiceSchedule({ ...card1, term_months: term }, vatRates);
    expect(invoices.map((i) => i.sequence)).toEqual(Array.from({ length: term }, (_, i) => i + 1));
  });

  it('dues on the last day of February, in normal and leap years (card 4)', () => {
    expect(invoice(card4, 2).due_date).toBe('2026-02-28');
    expect(invoice(card4, 26).due_date).toBe('2028-02-29');
  });

  it('returns to the 31st after a short month (card 4)', () => {
    expect(invoice(card4, 3).invoice_date).toBe('2026-03-31');
    expect(invoice(card4, 4).invoice_date).toBe('2026-04-30');
    expect(invoice(card4, 5).invoice_date).toBe('2026-05-31');
  });

  it('dates the first invoice on the start date', () => {
    expect(invoice(card3, 1).invoice_date).toBe('2026-09-15');
  });

  it.each([
    ['card 1', card1],
    ['card 3', card3],
    ['a month-end start', card4],
  ])('leaves no gaps or overlaps between periods: %s', (_name, contract) => {
    const invoices = invoiceSchedule(contract, vatRates);
    invoices.slice(1).forEach((current, i) => {
      expect(current.period_start).toBe(addDays(invoices[i]?.period_end ?? '', 1));
    });
  });

  it('ends the last period on the end date of the contract', () => {
    const invoices = invoiceSchedule(card1, vatRates);
    expect(invoices.at(-1)?.period_end).toBe('2029-11-04');
  });
});

describe('invoiceSchedule: records', () => {
  it('produces records that match the invoice schema once they have ids', () => {
    for (const [i, draft] of invoiceSchedule(card1, vatRates).entries()) {
      expect(invoiceSchema.safeParse({ id: `inv-${i}`, ...draft }).success).toBe(true);
    }
  });

  it('throws if the data has no VAT rate for a date, because that is a bug in the data', () => {
    const noRates: VatRates = { ...vatRates, rates: [] };
    expect(() => invoiceSchedule(card1, noRates)).toThrow(RangeError);
  });
});

describe('invoiceTotals', () => {
  it('adds up card 1 across the VAT change', () => {
    expect(invoiceTotals(invoiceSchedule(card1, vatRates))).toEqual({
      total_net_cents: 386_280,
      total_vat_cents: 100_332,
      total_cents: 486_612,
    });
  });

  it('is more than the first month times the term when VAT rises', () => {
    const invoices = invoiceSchedule(card1, vatRates);
    const naive = (invoices[0]?.total_cents ?? 0) * card1.term_months;

    expect(invoiceTotals(invoices).total_cents - naive).toBe(1_836);
  });

  it('counts the down payment and its VAT', () => {
    const totals = invoiceTotals(
      invoiceSchedule({ ...card1, start_on: '2027-02-01', down_payment_cents: 50_000 }, vatRates)
    );

    expect(totals.total_net_cents).toBe(50_000 + 10_730 * 36);
    expect(totals.total_vat_cents).toBe(13_000 + 2_790 * 36);
  });

  it('leaves out a cancelled invoice', () => {
    const issued = { status: 'issued', net_cents: 100, vat_cents: 26, total_cents: 126 } as const;

    expect(invoiceTotals([issued, { ...issued, status: 'cancelled' }])).toEqual({
      total_net_cents: 100,
      total_vat_cents: 26,
      total_cents: 126,
    });
  });

  it('is zero with no invoices', () => {
    expect(invoiceTotals([])).toEqual({ total_net_cents: 0, total_vat_cents: 0, total_cents: 0 });
  });
});

describe('futureVatCorrections', () => {
  const stored = (overrides: Partial<Invoice> = {}): Invoice => ({
    ...invoice(card1, 9),
    id: 'inv-9',
    ...overrides,
  });
  const later: VatRates = {
    country: 'FI',
    note: 'A rate announced after signing.',
    rates: [
      { rate_percent: 25.5, valid_from: '2024-09-01', valid_to: '2026-12-31' },
      { rate_percent: 26, valid_from: '2027-01-01', valid_to: '2027-06-30' },
      { rate_percent: 27, valid_from: '2027-07-01', valid_to: null },
    ],
  };

  it('moves a future invoice to the rate on its date, and keeps the net', () => {
    expect(futureVatCorrections([stored()], later, '2026-11-05')).toEqual([
      {
        id: 'inv-9',
        contract_id: 'con-1',
        sequence: 9,
        from_basis_points: 2_600,
        vat_rate_basis_points: 2_700,
        vat_cents: 2_897,
        total_cents: 13_627,
      },
    ]);
  });

  it('finds nothing when the rate has not changed', () => {
    expect(futureVatCorrections([stored()], vatRates, '2026-11-05')).toEqual([]);
  });

  it('never moves an invoice dated today or earlier', () => {
    const { invoice_date: today } = stored();

    expect(futureVatCorrections([stored()], later, today)).toEqual([]);
    expect(futureVatCorrections([stored()], later, addDays(today, 1))).toEqual([]);
    expect(futureVatCorrections([stored()], later, addDays(today, -1))).toHaveLength(1);
  });

  it.each(['paid', 'cancelled'] as const)('leaves a %s invoice alone', (status) => {
    expect(futureVatCorrections([stored({ status })], later, '2026-11-05')).toEqual([]);
  });

  it('keeps what it has on a date with no known rate', () => {
    const none: VatRates = { ...later, rates: [] };
    expect(futureVatCorrections([stored()], none, '2026-11-05')).toEqual([]);
  });

  it('follows a falling rate too', () => {
    const lower: VatRates = {
      ...later,
      rates: [{ rate_percent: 24, valid_from: '2024-09-01', valid_to: null }],
    };

    expect(futureVatCorrections([stored()], lower, '2026-11-05')[0]).toMatchObject({
      vat_rate_basis_points: 2_400,
      vat_cents: 2_575,
      total_cents: 13_305,
    });
  });
});
