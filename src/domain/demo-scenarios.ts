// What each demo persona already has when a presenter switches to them, so a scenario card
// starts at its interesting step. Pure: prices, coefficients, VAT and "today" are arguments.
import type { CoefficientTable, PriceList, VatRate } from '@/data/schemas';
import { monthlyFactorFor } from './coefficient';
import type { PlannedInvoice } from './demo-history';
import { forecastInvoices, quoteAmounts } from './lease-billing';
import { listPriceOn } from './price-list';

export type ScenarioCartItem = { id: string; termMonths: number; downPaymentCents: number };
export type ScenarioLease = {
  assetId: string;
  startDate: string;
  termMonths: number;
  downPaymentCents: number;
};
export type DemoScenario = { cart: ScenarioCartItem[]; lease: ScenarioLease | null };

const scenarios: Readonly<Record<string, DemoScenario>> = {
  // Card 1 (and card 8, which ends this lease early): already signed on 5 Nov 2026.
  'cust-aino': {
    cart: [],
    lease: { assetId: 'ebike-003', startDate: '2026-11-05', termMonths: 36, downPaymentCents: 0 },
  },
  // Card 5: chosen, not yet applied.
  'cust-mikko': { cart: [{ id: 'laptop-008', termMonths: 24, downPaymentCents: 0 }], lease: null },
  // Card 6: the applicant can't sign for the company.
  'cust-norvi': { cart: [{ id: 'ebike-004', termMonths: 36, downPaymentCents: 0 }], lease: null },
  // Card 7: €145,000 tractor, 48 months, €20,000 down.
  'cust-haapala': {
    cart: [{ id: 'farm-002', termMonths: 48, downPaymentCents: 2_000_000 }],
    lease: null,
  },
};

/** The scenario for a persona; anyone else starts with an empty cart and no lease. */
export function demoScenario(personaId: string): DemoScenario {
  return scenarios[personaId] ?? { cart: [], lease: null };
}

export type PlannedScenarioLease = {
  listPriceCents: number;
  priceListVersion: number;
  monthlyNetCents: number;
  buyoutCents: number;
  annualRateBasisPoints: number;
  /** Invoices due on or before today; those due before today are paid. */
  invoices: PlannedInvoice[];
};

/**
 * The contract a scenario lease would have, priced exactly as checkout prices it on its start
 * date. Null before the start date (the lease doesn't exist yet) or if it can't be financed.
 */
export function planScenarioLease(
  lease: ScenarioLease,
  today: string,
  priceLists: readonly PriceList[],
  table: CoefficientTable,
  rates: readonly VatRate[]
): PlannedScenarioLease | null {
  if (today < lease.startDate) return null;
  const price = listPriceOn(priceLists, lease.assetId, lease.startDate);
  if (!price.ok || lease.downPaymentCents > price.priceCents) return null;
  const financed = price.priceCents - lease.downPaymentCents;
  const factor = monthlyFactorFor(table, financed, lease.termMonths);
  const buyoutPercent = table.end_of_term_buyout_percent_of_financed[String(lease.termMonths)];
  if (!factor.ok || buyoutPercent === undefined) return null;
  const quote = quoteAmounts(financed, factor.factor, buyoutPercent);
  const schedule = forecastInvoices(
    lease.startDate,
    lease.termMonths,
    quote.monthlyNetCents,
    rates
  );
  if (!schedule.ok) return null;
  return {
    listPriceCents: price.priceCents,
    priceListVersion: price.priceListVersion,
    ...quote,
    annualRateBasisPoints: Math.round(factor.band.annual_interest_percent * 100),
    invoices: schedule.invoices
      .filter((invoice) => invoice.dueDate <= today)
      .map((invoice) => ({ ...invoice, paid: invoice.dueDate < today })),
  };
}
