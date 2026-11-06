// Every rule the app applies on a given day, in one read-only view for the demo panel (D-058).
// Values come from the data pack and pricing-rules.ts, never retyped here.
import type { PriceList, VatRates } from '@/data/schemas';
import type { BillingRule } from './invoicing';
import {
  AFFORDABILITY_PERCENT,
  DEFAULT_BILLING_RULE,
  DOWN_PAYMENT_STEP_CENTS,
  MANUAL_REVIEW_WHEN,
  QUOTE_VALID_DAYS,
  type ManualReviewRule,
} from './pricing-rules';
import { vatRateOn } from './vat';

export interface RulesInForce {
  date: string;
  /** The price list valid on `date`, or null before the first one. */
  priceListVersion: number | null;
  vatRatePercent: number | null;
  /** The next VAT change after `date`, when the data pack has one. */
  nextVat: { ratePercent: number; from: string } | null;
  quoteValidDays: number;
  affordabilityPercent: number;
  downPaymentStepCents: number;
  billingRule: BillingRule;
  manualReview: readonly ManualReviewRule[];
}

export function rulesInForce(
  data: { priceLists: readonly PriceList[]; vatRates: VatRates },
  date: string
): RulesInForce {
  // ISO dates sort like the days they name; both ends of a period are included, as in listPriceOn.
  const priceList = data.priceLists.find(
    (list) => list.valid_from <= date && (list.valid_to === null || date <= list.valid_to)
  );
  const vat = vatRateOn(data.vatRates, date);
  const next = data.vatRates.rates
    .filter((rate) => rate.valid_from > date)
    .sort((a, b) => a.valid_from.localeCompare(b.valid_from))[0];
  return {
    date,
    priceListVersion: priceList?.version ?? null,
    vatRatePercent: vat.ok ? vat.ratePercent : null,
    nextVat: next ? { ratePercent: next.rate_percent, from: next.valid_from } : null,
    quoteValidDays: QUOTE_VALID_DAYS,
    affordabilityPercent: AFFORDABILITY_PERCENT,
    downPaymentStepCents: DOWN_PAYMENT_STEP_CENTS,
    billingRule: DEFAULT_BILLING_RULE,
    manualReview: MANUAL_REVIEW_WHEN,
  };
}
