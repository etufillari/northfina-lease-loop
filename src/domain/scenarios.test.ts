// The judges' scenario cards from CHALLENGE.md §4, run against the real data pack.
// Each card grows here as the step it needs lands; expected values are worked by hand.
import { beforeAll, describe, expect, it } from 'vitest';
import { loadCoefficientTable, loadPriceLists, loadVatRates } from '@/data/load';
import type { CoefficientTable, PriceList, VatRates } from '@/data/schemas';
import { listPriceOn } from './price-list';
import { downPaymentBounds, quoteLease } from './pricing';
import { vatRateOn, withVat } from './vat';

let table: CoefficientTable;
let priceLists: PriceList[];
let vatRates: VatRates;
beforeAll(async () => {
  [table, priceLists, vatRates] = await Promise.all([
    loadCoefficientTable(),
    loadPriceLists(),
    loadVatRates(),
  ]);
});

function priceOn(assetId: string, isoDate: string): number {
  const result = listPriceOn(priceLists, assetId, isoDate);
  if (!result.ok) throw new Error(`no price for ${assetId} on ${isoDate}`);
  return result.priceCents;
}

describe('card 1, happy path: Aino leases ebike-003 for 36 months, no down payment, 5 Nov 2026', () => {
  it('shows the monthly rent net and with VAT, and the total cost', () => {
    // List price v1: 389 000. Rent 389 000 × 0.027584 = 10 730.176 → 10 730.
    // VAT in Nov 2026 at 25.5 %: 2 736.15 → 2 736, gross 13 466. Rents over 36 months: 386 280 net.
    const quote = quoteLease(table, {
      listPriceCents: priceOn('ebike-003', '2026-11-05'),
      termMonths: 36,
      downPaymentCents: 0,
    });
    expect(quote).toMatchObject({
      ok: true,
      monthlyNetRentCents: 10_730,
      totalNetCostCents: 386_280,
    });

    const vat = vatRateOn(vatRates, '2026-11-05');
    expect(vat).toEqual({ ok: true, ratePercent: 25.5 });
    if (!quote.ok || !vat.ok) return;
    expect(withVat(quote.monthlyNetRentCents, vat.ratePercent)).toEqual({
      netCents: 10_730,
      vatCents: 2_736,
      grossCents: 13_466,
    });
  });
});

describe('card 7, big ticket: Haapalan Tila leases farm-002, 48 months, 20 000 € down', () => {
  it('prices the lease from band D', () => {
    // 14 500 000 − 2 000 000 = 12 500 000 financed, band D. 12 500 000 × 0.021763 = 272 037.5 → 272 038.
    expect(
      quoteLease(table, {
        listPriceCents: priceOn('farm-002', '2026-11-05'),
        termMonths: 48,
        downPaymentCents: 2_000_000,
      })
    ).toMatchObject({
      ok: true,
      band: 'D',
      financedCents: 12_500_000,
      monthlyNetRentCents: 272_038,
    });
  });
});

describe('data-pack traps on price', () => {
  it('ebike-010 is too cheap on Thursday, and leasable with no down payment from Friday', () => {
    // v1 (5 Nov): 28 900 < 30 000 minimum. v2 (6 Nov, e-bikes +5 %): 30 300, so the most it can
    // take down is 30 300 − 30 000 = 300, which floors to 0 on a 1 000-cent step.
    expect(downPaymentBounds(table, priceOn('ebike-010', '2026-11-05'))).toEqual({
      ok: false,
      reason: 'below_minimum',
    });
    expect(downPaymentBounds(table, priceOn('ebike-010', '2026-11-06'))).toMatchObject({
      ok: true,
      minCents: 0,
      maxCents: 0,
    });
  });

  it('farm-006 at 260 000 € needs at least 10 000 € down', () => {
    expect(downPaymentBounds(table, priceOn('farm-006', '2026-11-05'))).toMatchObject({
      ok: true,
      minCents: 1_000_000,
    });
  });
});
