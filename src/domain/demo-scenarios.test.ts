import { beforeAll, describe, expect, it } from 'vitest';
import { loadAssets, loadCoefficientTable, loadPriceLists, loadVatRates } from '@/data/load';
import type { Asset, CoefficientTable, PriceList, VatRate } from '@/data/schemas';
import { demoScenario, planScenarioLease } from './demo-scenarios';

let priceLists: PriceList[];
let table: CoefficientTable;
let rates: VatRate[];
let assets: Asset[];
beforeAll(async () => {
  const [prices, coefficients, vat, all] = await Promise.all([
    loadPriceLists(),
    loadCoefficientTable(),
    loadVatRates(),
    loadAssets(),
  ]);
  [priceLists, table, rates, assets] = [prices, coefficients, vat.rates, all];
});
const aino = () => demoScenario('cust-aino').lease!;

describe('demoScenario', () => {
  it('gives each scenario persona the item its card starts from', () => {
    expect(demoScenario('cust-mikko').cart).toEqual([
      { id: 'laptop-008', termMonths: 24, downPaymentCents: 0 },
    ]);
    expect(demoScenario('cust-norvi').cart.map((item) => item.id)).toEqual(['ebike-004']);
    expect(demoScenario('cust-haapala').cart).toEqual([
      { id: 'farm-002', termMonths: 48, downPaymentCents: 2_000_000 },
    ]);
    expect(demoScenario('cust-aino')).toMatchObject({
      cart: [],
      lease: { assetId: 'ebike-003', startDate: '2026-11-05', termMonths: 36 },
    });
  });
  it('gives everyone else an empty cart and no lease', () => {
    expect(demoScenario('cust-lena')).toEqual({ cart: [], lease: null });
    expect(demoScenario('demo-staff')).toEqual({ cart: [], lease: null });
  });
  it('only uses items that exist and are available to lease', () => {
    for (const id of ['cust-aino', 'cust-mikko', 'cust-norvi', 'cust-haapala']) {
      const scenario = demoScenario(id);
      for (const assetId of [...scenario.cart.map((item) => item.id), scenario.lease?.assetId])
        if (assetId) expect(assets.find((asset) => asset.id === assetId)?.status).toBe('available');
    }
  });
});

describe('planScenarioLease (card 1)', () => {
  it('does not exist before its start date', () => {
    expect(planScenarioLease(aino(), '2026-11-04', priceLists, table, rates)).toBeNull();
  });
  it('locks price list v1 from the signing day, exactly as the data guide works it out', () => {
    expect(planScenarioLease(aino(), '2026-11-05', priceLists, table, rates)).toMatchObject({
      listPriceCents: 389000,
      priceListVersion: 1,
      monthlyNetCents: 10730,
      buyoutCents: 58350,
      invoices: [{ dueDate: '2026-11-05', vatCents: 2736, totalCents: 13466, paid: false }],
    });
  });
  it('keeps the v1 price on later dates and bills the months already due', () => {
    const plan = planScenarioLease(aino(), '2027-01-10', priceLists, table, rates)!;
    expect(plan.listPriceCents).toBe(389000);
    expect(plan.invoices.map((invoice) => [invoice.dueDate, invoice.vatBasisPoints])).toEqual([
      ['2026-11-05', 2550],
      ['2026-12-05', 2550],
      ['2027-01-05', 2600],
    ]);
    expect(plan.invoices.every((invoice) => invoice.paid)).toBe(true);
  });
  it('returns null when the lease cannot be priced', () => {
    expect(
      planScenarioLease({ ...aino(), assetId: 'nope' }, '2026-11-05', priceLists, table, rates)
    ).toBeNull();
    expect(
      planScenarioLease({ ...aino(), termMonths: 7 }, '2026-11-05', priceLists, table, rates)
    ).toBeNull();
    expect(
      planScenarioLease(
        { ...aino(), downPaymentCents: 999_999_999 },
        '2026-11-05',
        priceLists,
        table,
        rates
      )
    ).toBeNull();
  });
});
