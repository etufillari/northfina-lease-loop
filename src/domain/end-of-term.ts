// Spine step 6: at the end of the lease the customer buys the item, returns it, or passes it on
// to a named next lessee (D-029). The contract stays frozen; this decides what the ending records.
import type { AssetCondition, VatRates } from '@/data/schemas';
import { addDays, addMonthsClamped } from './calendar';
import type { BilledContract } from './invoicing';
import { vatRateOn, withVat, type VatBreakdown } from './vat';

/** What the ending needs from a contract. */
export interface EndedContract extends BilledContract {
  customerId: string;
  /** Net buyout locked at signing. */
  buyoutCents: number;
}

/** The item as it was handed to the customer: the floor for the return inspection. */
export interface DeliveredState {
  condition: AssetCondition;
  usageValue: number;
}

export interface Inspection {
  condition: AssetCondition;
  usageValue: number;
}

export type EndOfTermChoice =
  | { kind: 'buy' }
  | ({ kind: 'return' } & Inspection)
  | ({ kind: 'pass_on'; /** A persona id or an email. */ nextLessee: string } & Inspection);

export type EndOfTermKind = EndOfTermChoice['kind'];

export interface BuyoutInvoice extends VatBreakdown {
  invoiceDate: string;
  vatRatePercent: number;
}

export interface Ending {
  kind: EndOfTermKind;
  decidedOn: string;
  /** When ownership passes or the item comes back: the handover date, or later if decided late. */
  effectiveDate: string;
  buyoutInvoice?: BuyoutInvoice;
  inspection?: Inspection;
  nextLessee?: string;
}

export type EndOfTermResult =
  | { ok: true; ending: Ending }
  | { ok: false; reason: 'too_early'; opensOn: string }
  | {
      ok: false;
      reason: 'no_vat_rate' | 'usage_went_down' | 'condition_improved' | 'next_lessee_is_current';
    };

export interface EndOfTermDates {
  /** The last invoice date: the customer can choose from the start of the final month. */
  opensOn: string;
  /** The last day the lease covers. */
  lastDay: string;
  /** The day after the last period, when the item is bought or handed back. */
  handoverDate: string;
}

/** Best first. A returned item can't be in better condition than when it was delivered. */
const CONDITION_RANK: Record<AssetCondition, number> = {
  new: 0,
  like_new: 1,
  good: 2,
  fair: 3,
  poor: 4,
};

/** Counted from the start date like the invoice schedule, so a 31st never drifts (D-016). */
export function endOfTermDates(contract: BilledContract): EndOfTermDates {
  const handoverDate = addMonthsClamped(contract.startDate, contract.termMonths);
  return {
    opensOn: addMonthsClamped(contract.startDate, contract.termMonths - 1),
    lastDay: addDays(handoverDate, -1),
    handoverDate,
  };
}

/** The locked net buyout with VAT at the rate valid on `invoiceDate` (D-011). */
export function buyoutInvoice(
  contract: EndedContract,
  vatRates: VatRates,
  invoiceDate: string
): BuyoutInvoice | null {
  const vat = vatRateOn(vatRates, invoiceDate);
  if (!vat.ok) return null;
  return {
    invoiceDate,
    vatRatePercent: vat.ratePercent,
    ...withVat(contract.buyoutCents, vat.ratePercent),
  };
}

/**
 * Decides an end-of-term choice made on `today`. Open from the last invoice date; a choice made
 * before the handover takes effect on the handover date, a late one on the day it is made.
 */
export function endOfTerm(
  contract: EndedContract,
  vatRates: VatRates,
  delivered: DeliveredState,
  choice: EndOfTermChoice,
  today: string
): EndOfTermResult {
  const dates = endOfTermDates(contract);
  if (today < dates.opensOn) return { ok: false, reason: 'too_early', opensOn: dates.opensOn };
  // ISO dates compare as strings (D-015).
  const effectiveDate = today > dates.handoverDate ? today : dates.handoverDate;
  const base = { kind: choice.kind, decidedOn: today, effectiveDate };

  if (choice.kind === 'buy') {
    const invoice = buyoutInvoice(contract, vatRates, effectiveDate);
    if (!invoice) return { ok: false, reason: 'no_vat_rate' };
    return { ok: true, ending: { ...base, buyoutInvoice: invoice } };
  }

  const { condition, usageValue } = choice;
  if (!Number.isInteger(usageValue) || usageValue < 0) {
    throw new RangeError(`usageValue must be a whole number ≥ 0, got ${usageValue}`);
  }
  if (usageValue < delivered.usageValue) return { ok: false, reason: 'usage_went_down' };
  if (CONDITION_RANK[condition] < CONDITION_RANK[delivered.condition]) {
    return { ok: false, reason: 'condition_improved' };
  }
  const inspection = { condition, usageValue };

  if (choice.kind === 'return') return { ok: true, ending: { ...base, inspection } };
  if (choice.nextLessee === contract.customerId) {
    return { ok: false, reason: 'next_lessee_is_current' };
  }
  return { ok: true, ending: { ...base, inspection, nextLessee: choice.nextLessee } };
}
