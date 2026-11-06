import { describe, expect, it } from 'vitest';
import { summarizeLease, summarizePortfolio } from './lease-dashboard';
const rates = [{ valid_from: '2026-01-01', valid_to: null, rate_percent: 25.5 }];
const invoice = {
  dueDate: '2026-01-31',
  netCents: 1000,
  vatCents: 255,
  status: 'issued',
  payments: [
    { amountCents: 500, isSimulated: false },
    { amountCents: 200, isSimulated: true },
  ],
};
describe('lease dashboard totals', () => {
  it('separates issued amounts, real payments and forecasts', () => {
    const summary = summarizeLease(
      {
        startDate: '2026-01-31',
        termMonths: 2,
        monthlyNetCents: 1000,
        listPriceCents: 10000,
        downPaymentCents: 0,
        invoices: [invoice],
        isDemo: false,
      },
      rates,
      '2026-02-01'
    );
    expect(summary).toMatchObject({
      paidCents: 500,
      billedCents: 1255,
      outstandingCents: 755,
      elapsedMonths: 0,
      endDate: '2026-03-31',
      next: { amountCents: 755, kind: 'issued', status: 'overdue' },
    });
  });
  it('counts simulated payments only for demo leases and picks a forecast when bills are paid', () => {
    const paid = { ...invoice, payments: [{ amountCents: 1255, isSimulated: true }] };
    const summary = summarizeLease(
      {
        startDate: '2026-01-31',
        termMonths: 2,
        monthlyNetCents: 1000,
        listPriceCents: 10000,
        downPaymentCents: 0,
        invoices: [paid],
        isDemo: true,
      },
      rates,
      '2026-02-01'
    );
    expect(summary).toMatchObject({
      paidCents: 1255,
      outstandingCents: 0,
      next: { dueDate: '2026-02-28', amountCents: 1255, kind: 'forecast' },
    });
  });
  it('separates demo amounts from actual customer totals', () => {
    const base = {
      startDate: '2026-01-31',
      termMonths: 2,
      monthlyNetCents: 1000,
      listPriceCents: 10000,
      downPaymentCents: 0,
      invoices: [invoice],
      status: 'active',
    };
    const summary = summarizePortfolio(
      [
        { ...base, isDemo: false },
        { ...base, isDemo: true },
      ],
      rates,
      '2026-02-01'
    );
    expect(summary).toMatchObject({
      activeCount: 2,
      realPaidCents: 500,
      demoPaidCents: 700,
      outstandingCents: 755,
    });
  });

  it('uses an issued invoice snapshot in the forecast total even if VAT data changes', () => {
    const lease = {
      startDate: '2026-01-31',
      termMonths: 2,
      monthlyNetCents: 1000,
      listPriceCents: 10000,
      downPaymentCents: 0,
      invoices: [invoice],
      isDemo: false,
    };
    const changedRates = [{ valid_from: '2026-01-01', valid_to: null, rate_percent: 26 }];
    expect(summarizeLease(lease, changedRates, '2026-02-01').forecastTotalCents).toBe(2515);
  });

  it('includes VAT on the initial down payment using the contract start date', () => {
    const summary = summarizeLease(
      {
        startDate: '2026-12-15',
        termMonths: 2,
        monthlyNetCents: 1000,
        listPriceCents: 100000,
        downPaymentCents: 10000,
        invoices: [],
        isDemo: false,
      },
      [
        { valid_from: '2026-01-01', valid_to: '2026-12-31', rate_percent: 25.5 },
        { valid_from: '2027-01-01', valid_to: null, rate_percent: 26 },
      ],
      '2027-01-01'
    );
    expect(summary.downPaymentTotalCents).toBe(12550);
    expect(summary.forecastTotalCents).toBe(12550 + 1255 + 1260);
  });

  it('does not invent a gross total when the down payment tax rate is unavailable', () => {
    const summary = summarizeLease(
      {
        startDate: '2026-12-15',
        termMonths: 2,
        monthlyNetCents: 1000,
        listPriceCents: 100000,
        downPaymentCents: 10000,
        invoices: [],
        isDemo: false,
      },
      [{ valid_from: '2027-01-01', valid_to: null, rate_percent: 26 }],
      '2027-01-01'
    );
    expect(summary.downPaymentTotalCents).toBeNull();
    expect(summary.forecastTotalCents).toBeNull();
  });
});
