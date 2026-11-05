import type { VatRate } from '@/data/schemas';
import { calculateBillingSchedule, isDateOnly } from './calendar';
import type { BillingPeriod, EngineResult, LeaseTerms } from './types';

export type InvoiceCalculation = Readonly<{
  contractId: string;
  assetId: string;
  customerId: string;
  currency: 'EUR';
  period: BillingPeriod;
  netCents: number;
  vatCents: number;
  grossCents: number;
  tax: Readonly<{ rateBps: number; validFrom: string; validTo: string | null; fictional: boolean }>;
}>;

/** Rates use the pack's inclusive date boundaries. No match or overlapping matches fail. */
export function resolveVat(
  rates: readonly VatRate[],
  issueDate: string
): EngineResult<InvoiceCalculation['tax']> {
  if (!isDateOnly(issueDate)) return { ok: false, reason: 'invalid_date' };
  for (const rate of rates) {
    if (
      !isDateOnly(rate.valid_from) ||
      (rate.valid_to !== null && (!isDateOnly(rate.valid_to) || rate.valid_to < rate.valid_from)) ||
      !/^\d+(?:\.\d{1,2})?$/.test(String(rate.rate_percent)) ||
      rate.rate_percent > 100
    ) {
      return { ok: false, reason: 'invalid_tax_rule' };
    }
  }
  const matches = rates.filter(
    (rate) => rate.valid_from <= issueDate && (rate.valid_to === null || issueDate <= rate.valid_to)
  );
  if (matches.length === 0) return { ok: false, reason: 'tax_rule_missing' };
  if (matches.length > 1) return { ok: false, reason: 'tax_rule_overlap' };
  const rate = matches[0];
  if (!rate) return { ok: false, reason: 'tax_rule_missing' };
  // Convert the decimal representation to basis points without multiplying binary floats.
  const [whole, fraction = ''] = String(rate.rate_percent).split('.');
  const rateBps = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  return {
    ok: true,
    value: {
      rateBps,
      validFrom: rate.valid_from,
      validTo: rate.valid_to,
      fictional: rate.fictional ?? false,
    },
  };
}

/** Calculates rent only. Persistence, invoice numbers and duplicate protection belong to adapters. */
export function calculateInvoice(
  terms: LeaseTerms,
  periodIndex: number,
  rates: readonly VatRate[]
): EngineResult<InvoiceCalculation> {
  const schedule = calculateBillingSchedule(terms);
  if (!schedule.ok) return schedule;
  if (!Number.isInteger(periodIndex) || periodIndex < 1 || periodIndex > schedule.value.length) {
    return { ok: false, reason: 'invalid_period' };
  }
  const period = schedule.value[periodIndex - 1];
  if (!period) return { ok: false, reason: 'invalid_period' };
  const tax = resolveVat(rates, period.issueDate);
  if (!tax.ok) return tax;
  // Positive half-up rounding once per rent line; all intermediates are exact integers.
  const vat = (BigInt(period.netCents) * BigInt(tax.value.rateBps) + 5000n) / 10000n;
  const gross = BigInt(period.netCents) + vat;
  if (gross > BigInt(Number.MAX_SAFE_INTEGER)) return { ok: false, reason: 'amount_overflow' };
  return {
    ok: true,
    value: {
      contractId: terms.contractId,
      assetId: terms.assetId,
      customerId: terms.customerId,
      currency: 'EUR',
      period,
      netCents: period.netCents,
      vatCents: Number(vat),
      grossCents: Number(gross),
      tax: tax.value,
    },
  };
}
