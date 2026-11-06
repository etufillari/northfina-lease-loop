import { describe, expect, it } from 'vitest';
import { loadAssets, loadCoefficientTable, loadPriceLists, loadVatRates } from '@/data/load';
import { companyMetrics, type MetricsContract } from './company-metrics';
import { planDemoHistory, type PlannedLease } from './demo-history';

const today = '2026-11-06';
const [assets, priceLists, table, vat] = await Promise.all([
  loadAssets(),
  loadPriceLists(),
  loadCoefficientTable(),
  loadVatRates(),
]);
const catalogue = assets.map((asset) => ({
  id: asset.id,
  category: asset.category,
  make: asset.make,
  model: asset.model,
  usageUnit: asset.usage.unit,
}));
const plan = (months = 24, on = today) =>
  planDemoHistory({ today: on, months, catalogue, priceLists, table, rates: vat.rates });
const toMetrics = (lease: PlannedLease): MetricsContract => ({
  category: lease.category,
  startDate: lease.startDate,
  termMonths: lease.termMonths,
  status: lease.status,
  endedOn: lease.endedOn,
  downPaymentCents: lease.downPaymentCents,
  invoices: lease.invoices,
  buyouts: lease.buyout ? [lease.buyout] : [],
});

describe('planDemoHistory', () => {
  const leases = plan();

  it('is deterministic and uses every category and outcome', () => {
    expect(plan()).toEqual(leases);
    expect(new Set(leases.map((lease) => lease.category)).size).toBe(3);
    expect(new Set(leases.map((lease) => lease.status))).toEqual(
      new Set(['active', 'completed', 'returned', 'bought'])
    );
    expect(new Set(leases.map((lease) => lease.sequence)).size).toBe(leases.length);
  });

  it('never records anything after today', () => {
    for (const lease of leases) {
      expect(lease.startDate <= today).toBe(true);
      if (lease.endedOn) expect(lease.endedOn <= today).toBe(true);
      for (const invoice of lease.invoices) expect(invoice.dueDate <= today).toBe(true);
    }
  });

  it('uses whole cents and the same rent on every invoice', () => {
    for (const lease of leases) {
      expect(Number.isSafeInteger(lease.monthlyNetCents)).toBe(true);
      for (const invoice of lease.invoices) {
        expect(invoice.netCents).toBe(lease.monthlyNetCents);
        expect(invoice.totalCents).toBe(invoice.netCents + invoice.vatCents);
      }
    }
  });

  it('stops billing when a lease ends and keeps every ended lease consistent', () => {
    for (const lease of leases) {
      expect(lease.status === 'active').toBe(lease.endedOn === null);
      expect(lease.buyout !== null).toBe(lease.status === 'bought');
      if (lease.endedOn)
        expect(lease.invoices.every((invoice) => invoice.dueDate < lease.endedOn!)).toBe(true);
      expect(lease.invoices.length).toBeLessThanOrEqual(lease.termMonths);
    }
  });

  it('applies the VAT rate valid on each invoice date', () => {
    const rates = new Set(
      leases.flatMap((lease) => lease.invoices.map((invoice) => invoice.vatBasisPoints))
    );
    expect(rates).toEqual(new Set([2550]));
  });

  it('records unpaid invoices only on active leases, and only the latest', () => {
    const unpaid = leases.filter((lease) => lease.invoices.some((invoice) => !invoice.paid));
    expect(unpaid.length).toBeGreaterThan(0);
    for (const lease of unpaid) {
      expect(lease.status).toBe('active');
      expect(lease.invoices.at(-1)!.paid).toBe(false);
      expect(lease.invoices.filter((invoice) => !invoice.paid)).toHaveLength(1);
    }
  });

  it('marks prices from before the first price list, and uses listed prices afterwards', () => {
    const early = leases.find((lease) => lease.startDate < '2026-01-01');
    const late = leases.find((lease) => lease.startDate >= '2026-02-01');
    expect(early?.priceListVersion).toBe(0);
    expect(late?.priceListVersion).toBe(1);
  });

  it('leaves out items that cannot be financed and the largest machines', () => {
    const ids = new Set(leases.map((lease) => lease.source.id));
    expect(ids.has('ebike-010')).toBe(false);
    expect(ids.has('farm-006')).toBe(false);
  });

  it('feeds charts that grow, where machinery overtakes bikes on revenue with fewer leases', () => {
    const metrics = companyMetrics(leases.map(toMetrics), today);
    const { activeLeases, revenueCents, summary } = metrics;
    expect(activeLeases.total[22]!).toBeGreaterThan(activeLeases.total[3]!);
    expect(summary.topCategory).toBe('e_bike');
    expect(revenueCents.farm_machine[22]!).toBeGreaterThan(revenueCents.e_bike[22]!);
    expect(activeLeases.farm_machine[22]!).toBeLessThan(activeLeases.e_bike[22]!);
    expect(revenueCents.total.every((value) => value > 0)).toBe(true);
  });

  it('returns an empty plan when no item can be priced', () => {
    expect(
      planDemoHistory({ today, months: 12, catalogue: [], priceLists, table, rates: vat.rates })
    ).toEqual([]);
  });

  it('skips items with no price at all', () => {
    expect(
      planDemoHistory({
        today,
        months: 12,
        catalogue: [{ ...catalogue[0]!, id: 'not-in-any-list' }],
        priceLists,
        table,
        rates: vat.rates,
      })
    ).toEqual([]);
  });
});
