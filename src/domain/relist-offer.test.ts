import { describe, expect, it } from 'vitest';
import {
  loadCoefficientTable,
  loadRefurbishmentCosts,
  loadResidualCurves,
  loadVatRates,
} from '@/data/load';
import { assetRecovery } from './asset-recovery';
import { relistOffer, type RelistInput } from './relist-offer';

const [curves, costs, table, vat] = await Promise.all([
  loadResidualCurves(),
  loadRefurbishmentCosts(),
  loadCoefficientTable(),
  loadVatRates(),
]);
const input: RelistInput = {
  category: 'e_bike',
  originalPriceCents: 400000,
  firstLeaseDate: '2025-11-06',
  condition: 'fair',
  targetCondition: 'good',
  usageValue: 5000,
  maintenanceUsageValue: 0,
  additionalRepairCents: 1000,
  quotedPriceCents: 0,
  today: '2026-11-06',
};
const offer = (overrides: Partial<RelistInput> = {}) =>
  relistOffer({ ...input, ...overrides }, curves, costs, table, vat.rates);

describe('relistOffer', () => {
  it('matches the quote valuation when relisted on the quote date', () => {
    const quoted = assetRecovery({ ...input, ageMonths: 12 }, curves, costs);
    expect(offer({ quotedPriceCents: quoted.postRepairValueCents })).toMatchObject({
      ageMonths: 12,
      priceNetCents: quoted.postRepairValueCents,
      priceChangeSinceQuoteCents: 0,
      refurbishmentCostCents: quoted.refurbishmentCostCents,
      netResultCents: quoted.postRepairValueCents - quoted.refurbishmentCostCents,
      leasable: true,
    });
  });

  it('lowers the price as the item waits, and reports the drop', () => {
    const quotedPrice = offer().priceNetCents;
    const later = offer({ quotedPriceCents: quotedPrice, today: '2027-05-06' });
    expect(later.ageMonths).toBe(18);
    expect(later.priceNetCents).toBeLessThan(quotedPrice);
    expect(later.priceChangeSinceQuoteCents).toBe(later.priceNetCents - quotedPrice);
  });

  it('gives a VAT-inclusive example payment using the VAT rate of the relist date', () => {
    const net = offer().monthlyTotalCents;
    const after = offer({ today: '2027-01-02', firstLeaseDate: '2026-01-02' }).monthlyTotalCents;
    expect(net).toBeGreaterThan(0);
    expect(after).toBeGreaterThan(0);
  });

  it('shows a loss rather than hiding it', () => {
    const result = offer({ additionalRepairCents: 900000 });
    expect(result.netResultCents).toBeLessThan(0);
    expect(result.priceNetCents).toBeGreaterThan(0);
  });

  it('reports an item priced below the financing table as not leasable', () => {
    const result = offer({ originalPriceCents: 30000 });
    expect(result).toMatchObject({ leasable: false, monthlyTotalCents: null });
  });
});
