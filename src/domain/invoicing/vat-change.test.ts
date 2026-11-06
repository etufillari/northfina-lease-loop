import { beforeAll, describe, expect, it } from 'vitest';
import { loadVatRates } from '@/data/load';
import type { VatRates } from '@/data/schemas';
import { invoiceSchedule } from './invoicing';
import { upcomingVatChange, withVatChanges } from './vat-change';

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

const changed = (invoices: ReturnType<typeof withVatChanges>) =>
  invoices.filter((invoice) => invoice.vat_change !== null);

const rent = (overrides: {
  contract_id?: string;
  rate: number;
  net?: number;
  total: number;
  kind?: 'rent' | 'down_payment' | 'buyout';
}) => ({
  contract_id: overrides.contract_id ?? 'con-1',
  kind: overrides.kind ?? ('rent' as const),
  net_cents: overrides.net ?? 10_000,
  vat_rate_basis_points: overrides.rate,
  total_cents: overrides.total,
});

describe('withVatChanges', () => {
  it('explains the January invoice of card 3', () => {
    const invoices = withVatChanges(invoiceSchedule(card3, vatRates));

    expect(changed(invoices)).toHaveLength(1);
    expect(changed(invoices)[0]).toMatchObject({
      vat_change: {
        from_percent: 25.5,
        to_percent: 26,
        net_change_cents: 0,
        total_change_cents: 35,
      },
    });
  });

  it('puts the change on the first invoice at the new rate', () => {
    const invoices = withVatChanges(invoiceSchedule(card1, vatRates));

    expect(invoices[1]?.vat_change).toBeNull();
    expect(invoices[2]?.vat_change?.total_change_cents).toBe(54);
    expect(invoices[3]?.vat_change).toBeNull();
  });

  it('finds nothing on a contract that starts after the change', () => {
    const later = { ...card1, start_on: '2027-02-01' };
    expect(changed(withVatChanges(invoiceSchedule(later, vatRates)))).toEqual([]);
  });

  it('skips the down payment and compares the rents', () => {
    const invoices = withVatChanges(
      invoiceSchedule({ ...card3, down_payment_cents: 50_000 }, vatRates)
    );

    expect(invoices[0]?.kind).toBe('down_payment');
    expect(invoices[0]?.vat_change).toBeNull();
    expect(invoices[1]?.vat_change).toBeNull();
    expect(changed(invoices)).toHaveLength(1);
    expect(changed(invoices)[0]?.vat_change?.total_change_cents).toBe(35);
  });

  it('never compares a buyout, even at a new rate', () => {
    const invoices = withVatChanges([
      rent({ rate: 2_550, total: 12_550 }),
      rent({ rate: 2_600, net: 58_350, total: 73_521, kind: 'buyout' }),
    ]);

    expect(invoices[1]?.vat_change).toBeNull();
  });

  it('keeps contracts apart in a shared list', () => {
    const invoices = withVatChanges([
      rent({ contract_id: 'con-1', rate: 2_550, total: 12_550 }),
      rent({ contract_id: 'con-2', rate: 2_600, total: 12_600 }),
      rent({ contract_id: 'con-1', rate: 2_550, total: 12_550 }),
    ]);

    expect(changed(invoices)).toEqual([]);
  });

  it('shows a falling rate as a lower total', () => {
    const [, second] = withVatChanges([
      rent({ rate: 2_600, total: 12_600 }),
      rent({ rate: 2_400, total: 12_400 }),
    ]);

    expect(second?.vat_change).toEqual({
      from_percent: 26,
      to_percent: 24,
      net_change_cents: 0,
      total_change_cents: -200,
    });
  });

  it('reports a new rate even when rounding leaves the total the same', () => {
    const [, second] = withVatChanges([
      rent({ rate: 2_550, net: 1, total: 1 }),
      rent({ rate: 2_600, net: 1, total: 1 }),
    ]);

    expect(second?.vat_change?.total_change_cents).toBe(0);
  });

  it('accepts an empty list', () => {
    expect(withVatChanges([])).toEqual([]);
  });
});

describe('upcomingVatChange', () => {
  const lease = (startOn: string, termMonths = 36) => ({
    startOn,
    termMonths,
    monthlyNetRentCents: 10_730,
  });

  it('warns on card 1 about the new monthly total', () => {
    expect(upcomingVatChange(vatRates, lease('2026-11-05'))).toEqual({
      effective_on: '2027-01-01',
      rate_percent: 26,
      monthly_total_cents: 13_520,
      monthly_change_cents: 54,
    });
  });

  it('stays quiet when the lease starts on the new rate', () => {
    expect(upcomingVatChange(vatRates, lease('2027-01-01'))).toBeNull();
  });

  it('stays quiet when the last rent comes before the change', () => {
    expect(upcomingVatChange(vatRates, lease('2026-01-02', 12))).toBeNull();
  });

  it('warns when the last rent falls on the first day of the new rate', () => {
    expect(upcomingVatChange(vatRates, lease('2026-02-01', 12))?.effective_on).toBe('2027-01-01');
  });

  it('warns from the last day of the old rate', () => {
    expect(upcomingVatChange(vatRates, lease('2026-12-31', 2))?.rate_percent).toBe(26);
    expect(upcomingVatChange(vatRates, lease('2026-12-31', 1))).toBeNull();
  });

  it('skips a new period with the same rate', () => {
    const rates: VatRates = {
      ...vatRates,
      rates: [
        { rate_percent: 24, valid_from: '2026-01-01', valid_to: '2026-06-30' },
        { rate_percent: 24, valid_from: '2026-07-01', valid_to: '2026-12-31' },
        { rate_percent: 25, valid_from: '2027-01-01', valid_to: null },
      ],
    };

    expect(upcomingVatChange(rates, lease('2026-03-01'))?.effective_on).toBe('2027-01-01');
  });

  it('finds the first change however the rates are ordered', () => {
    const rates: VatRates = {
      ...vatRates,
      rates: [
        { rate_percent: 27, valid_from: '2028-01-01', valid_to: null },
        { rate_percent: 26, valid_from: '2027-01-01', valid_to: '2027-12-31' },
        { rate_percent: 25.5, valid_from: '2024-09-01', valid_to: '2026-12-31' },
      ],
    };

    expect(upcomingVatChange(rates, lease('2026-11-05'))?.rate_percent).toBe(26);
  });

  it('answers null on a date with no VAT rate', () => {
    expect(upcomingVatChange(vatRates, lease('2000-01-01'))).toBeNull();
  });

  it('always agrees with the invoices themselves', () => {
    const starts = ['2026-01-31', '2026-06-15', '2026-11-05', '2026-12-31', '2027-01-01'];

    for (const start_on of starts) {
      for (const term_months of [1, 6, 12, 24, 36, 48]) {
        const invoices = withVatChanges(
          invoiceSchedule({ ...card1, start_on, term_months }, vatRates)
        );
        const billed = changed(invoices)[0];
        const warned = upcomingVatChange(vatRates, lease(start_on, term_months));

        expect(warned?.monthly_total_cents, `${start_on}, ${term_months}`).toBe(
          billed?.total_cents
        );
      }
    }
  });
});
