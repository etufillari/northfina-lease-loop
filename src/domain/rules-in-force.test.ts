// Expected values read from data/price-lists.json, data/vat-rates.json and pricing-rules.ts.
import { beforeAll, describe, expect, it } from 'vitest';
import { loadPriceLists, loadVatRates } from '@/data/load';
import type { PriceList, VatRates } from '@/data/schemas';
import { rulesInForce } from './rules-in-force';

let data: { priceLists: PriceList[]; vatRates: VatRates };

beforeAll(async () => {
  data = { priceLists: await loadPriceLists(), vatRates: await loadVatRates() };
});

describe('rulesInForce', () => {
  it('on Thursday 5 Nov 2026: price list 1, VAT 25.5 %, 26 % announced from 1 Jan 2027', () => {
    expect(rulesInForce(data, '2026-11-05')).toMatchObject({
      date: '2026-11-05',
      priceListVersion: 1,
      vatRatePercent: 25.5,
      nextVat: { ratePercent: 26, from: '2027-01-01' },
    });
  });

  it('on Friday 6 Nov 2026: price list 2 (valid from 6 Nov)', () => {
    expect(rulesInForce(data, '2026-11-06').priceListVersion).toBe(2);
  });

  it('on 31 Dec 2026, the last day of 25.5 %', () => {
    expect(rulesInForce(data, '2026-12-31')).toMatchObject({
      vatRatePercent: 25.5,
      nextVat: { ratePercent: 26, from: '2027-01-01' },
    });
  });

  it('from 1 Jan 2027: 26 %, and no further change in the data pack', () => {
    expect(rulesInForce(data, '2027-01-01')).toMatchObject({ vatRatePercent: 26, nextVat: null });
  });

  it('shows the rules the code applies, from pricing-rules.ts', () => {
    expect(rulesInForce(data, '2026-11-05')).toMatchObject({
      quoteValidDays: 7, // D-014
      affordabilityPercent: 30, // D-023
      downPaymentStepCents: 1_000, // D-012
      billingRule: 'start_day_full_months', // D-016
      manualReview: [{ questionId: 'q_pep', answer: 'yes', reason: 'pep_manual_review' }],
    });
  });
});
