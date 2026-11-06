import type { VatRates } from '@/data/schemas';
import { isIsoDate } from './calendar';
import { decimalToScaled, multiplyRatio } from './money-arithmetic';

export type TaxedAmount = {
  netCents: number;
  vatBasisPoints: number;
  vatCents: number;
  grossCents: number;
};
export type TaxResult = { ok: true; amount: TaxedAmount } | { ok: false; reason: 'no_vat_rate' };

/** 2550 basis points means 25.5%. Select the rate on the invoice date, not signature date. */
export function taxOn(netCents: number, invoiceDate: string, table: VatRates): TaxResult {
  if (!Number.isSafeInteger(netCents) || netCents < 0) {
    throw new RangeError('net amount must be safe integer cents');
  }
  if (!isIsoDate(invoiceDate)) throw new RangeError('invoice date must be a real ISO date');
  const matches = table.rates.filter(
    (rate) =>
      rate.valid_from <= invoiceDate && (rate.valid_to === null || invoiceDate <= rate.valid_to)
  );
  if (matches.length > 1) throw new RangeError('VAT date ranges overlap');
  const rate = matches[0];
  if (!rate) return { ok: false, reason: 'no_vat_rate' };
  const vatBasisPoints = decimalToScaled(rate.rate_percent, 2);
  // Round the tax once to cents; an exact half-cent rounds up.
  const vatCents = multiplyRatio(netCents, vatBasisPoints, 10000);
  const grossCents = netCents + vatCents;
  if (!Number.isSafeInteger(grossCents)) {
    throw new RangeError('gross amount exceeds safe integer cents');
  }
  return { ok: true, amount: { netCents, vatBasisPoints, vatCents, grossCents } };
}
