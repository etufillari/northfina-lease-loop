// The buyout invoice a customer agrees to when they choose to buy the item: issued on the
// last day of the term (or on the day they buy, if that is later), payable within 30 days,
// with VAT at the rate valid on the invoice date — like every other invoice, VAT is not
// locked (docs/DECISIONS.md).
import type { VatRates } from '@/data/schemas';
import { addDays } from './calendar';
import { vatCents, vatRateOn } from './vat';

/** Days the customer has to pay the buyout invoice. */
export const BUYOUT_PAYMENT_DAYS = 30;

export type BuyoutInvoicePreview = {
  netCents: number;
  vatRatePercent: number;
  vatCents: number;
  totalCents: number;
  /** The day the invoice is issued. */
  invoiceDate: string;
  dueDate: string;
};

export type BuyoutInvoicePreviewResult =
  { ok: true; preview: BuyoutInvoicePreview } | { ok: false; reason: 'no_vat_rate_on_date' };

export function buyoutInvoicePreview(
  input: { buyoutNetCents: number; termEndsOn: string; asOf: string },
  vatRates: VatRates
): BuyoutInvoicePreviewResult {
  if (!Number.isInteger(input.buyoutNetCents)) throw new RangeError('money must be whole cents');
  const invoiceDate = input.asOf > input.termEndsOn ? input.asOf : input.termEndsOn;
  const vat = vatRateOn(vatRates, invoiceDate);
  if (!vat.ok) return { ok: false, reason: vat.reason };
  const vatPart = vatCents(input.buyoutNetCents, vat.rateBasisPoints);
  return {
    ok: true,
    preview: {
      netCents: input.buyoutNetCents,
      vatRatePercent: vat.ratePercent,
      vatCents: vatPart,
      totalCents: input.buyoutNetCents + vatPart,
      invoiceDate,
      dueDate: addDays(invoiceDate, BUYOUT_PAYMENT_DAYS),
    },
  };
}
