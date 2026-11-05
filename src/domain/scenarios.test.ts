// The judges' scenario cards from CHALLENGE.md §4, run against the real data pack.
// Each card grows here as the step it needs lands; expected values are worked by hand.
import { beforeAll, describe, expect, it } from 'vitest';
import { loadCoefficientTable, loadPriceLists, loadVatRates } from '@/data/load';
import type { CoefficientTable, PriceList, VatRates } from '@/data/schemas';
import { priceCheckAtSigning, signContract } from './contract';
import { listPriceOn } from './price-list';
import { invoiceSchedule } from './invoicing';
import { makeQuote } from './quote';
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

describe('card 2, the price lock: laptop-004 quoted Thu 5 Nov (v1), signed Fri 6 Nov (v2, −8 %)', () => {
  it('locks the quoted v1 price, and tells the customer a cheaper quote is available today', () => {
    // Thu, v1: 349 000 × 0.027584 = 9 626.8 → 9 627/month (36 m, band B).
    // Fri, v2: 321 100 × 0.027584 = 8 857.2 → 8 857/month. Saving 770/month.
    const made = makeQuote(priceLists, table, {
      assetId: 'laptop-004',
      quoteDate: '2026-11-05',
      termMonths: 36,
      downPaymentCents: 0,
    });
    if (!made.ok) throw new Error(made.reason);

    expect(priceCheckAtSigning(priceLists, table, made.quote, '2026-11-06')).toMatchObject({
      kind: 'cheaper_today',
      savingPerMonthCents: 770,
      requote: { priceListVersion: 2, monthlyNetRentCents: 8_857 },
    });

    const signed = signContract(made.quote, {
      customerId: 'cust-aino',
      signDate: '2026-11-06',
      startDate: '2026-11-06',
    });
    expect(signed).toMatchObject({
      ok: true,
      contract: { priceListVersion: 1, listPriceCents: 349_000, monthlyNetRentCents: 9_627 },
    });
  });
});

/** Quote and sign on the start date, as the cards describe. */
function signedLease(assetId: string, startDate: string, termMonths: number, downPaymentCents = 0) {
  const made = makeQuote(priceLists, table, {
    assetId,
    quoteDate: startDate,
    termMonths,
    downPaymentCents,
  });
  if (!made.ok) throw new Error(made.reason);
  const signed = signContract(made.quote, {
    customerId: 'cust-test',
    signDate: startDate,
    startDate,
  });
  if (!signed.ok) throw new Error(signed.reason);
  const schedule = invoiceSchedule(signed.contract, vatRates);
  if (!schedule.ok) throw new Error(schedule.reason);
  return { contract: signed.contract, ...schedule };
}

describe('card 1, invoices: Aino’s first three invoices and the total cost', () => {
  it('bills 13 466 in Nov and Dec 2026, then 13 520 from Jan 2027 when VAT goes to 26 %', () => {
    // 10 730 net. 25.5 %: 2 736 VAT. 26 %: 10 730 × 0.26 = 2 789.8 → 2 790 VAT.
    const { invoices, totals } = signedLease('ebike-003', '2026-11-05', 36);
    expect(
      invoices.slice(0, 3).map((i) => [i.invoiceDate, i.netCents, i.vatCents, i.grossCents])
    ).toEqual([
      ['2026-11-05', 10_730, 2_736, 13_466],
      ['2026-12-05', 10_730, 2_736, 13_466],
      ['2027-01-05', 10_730, 2_790, 13_520],
    ]);
    // 2 × 13 466 + 34 × 13 520 = 26 932 + 459 680 = 486 612 gross over 36 months.
    expect(totals).toEqual({ netCents: 386_280, vatCents: 100_332, grossCents: 486_612 });
  });
});

describe('card 3, tax is not price: ebike-001, 24 months from 15 Sep 2026', () => {
  it('keeps the net rent and changes only the VAT between Dec 2026 and Jan 2027', () => {
    // v1 189 900, band A 24 m: 189 900 × 0.036637 = 6 957.37 → 6 957.
    // Dec, 25.5 %: 1 774.04 → 1 774, gross 8 731. Jan, 26 %: 1 808.82 → 1 809, gross 8 766.
    const { invoices } = signedLease('ebike-001', '2026-09-15', 24);
    expect(invoices[3]).toMatchObject({
      invoiceDate: '2026-12-15',
      netCents: 6_957,
      vatRatePercent: 25.5,
      vatCents: 1_774,
      grossCents: 8_731,
    });
    expect(invoices[4]).toMatchObject({
      invoiceDate: '2027-01-15',
      netCents: 6_957,
      vatRatePercent: 26,
      vatCents: 1_809,
      grossCents: 8_766,
    });
  });
});

describe('card 4, calendar traps: laptop-001, 36 months from 31 Jan 2026', () => {
  it('is due 28 Feb 2026 and 29 Feb 2028 (a leap year), and back on the 31st in March', () => {
    const { invoices } = signedLease('laptop-001', '2026-01-31', 36);
    expect(invoices[1]?.invoiceDate).toBe('2026-02-28');
    expect(invoices[2]?.invoiceDate).toBe('2026-03-31');
    // Feb 2028 is month 26 of the lease: Jan 2026 + 25 months.
    expect(invoices[25]?.invoiceDate).toBe('2028-02-29');
    expect(invoices[35]?.invoiceDate).toBe('2028-12-31');
  });
});
