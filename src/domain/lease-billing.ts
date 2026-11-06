import type { VatRate } from '@/data/schemas';

export type ForecastInvoice = {
  dueDate: string;
  netCents: number;
  vatBasisPoints: number;
  vatCents: number;
  totalCents: number;
};

/** Coefficients use six decimal places; round each result once, half up, to a cent. */
export function quoteAmounts(financedCents: number, monthlyFactor: number, buyoutPercent: number) {
  if (!Number.isSafeInteger(financedCents) || financedCents < 0)
    throw new RangeError('Invalid financed amount');
  const factorMillionths = Math.round(monthlyFactor * 1_000_000);
  const buyoutBasisPoints = Math.round(buyoutPercent * 100);
  if (
    !Number.isSafeInteger(factorMillionths) ||
    factorMillionths < 0 ||
    Math.abs(factorMillionths / 1_000_000 - monthlyFactor) > 1e-12 ||
    !Number.isSafeInteger(buyoutBasisPoints) ||
    buyoutBasisPoints < 0 ||
    buyoutBasisPoints > 10_000 ||
    Math.abs(buyoutBasisPoints / 100 - buyoutPercent) > 1e-9
  )
    throw new RangeError('Invalid quote factor');
  const financed = BigInt(financedCents);
  const monthlyNetCents = Number((financed * BigInt(factorMillionths) + 500_000n) / 1_000_000n);
  const buyoutCents = Number((financed * BigInt(buyoutBasisPoints) + 5_000n) / 10_000n);
  if (!Number.isSafeInteger(monthlyNetCents) || !Number.isSafeInteger(buyoutCents))
    throw new RangeError('Quote exceeds safe integer range');
  return { monthlyNetCents, buyoutCents };
}

/** Calendar months retain the original day, clamped to the last day in short months. */
export function dueDateForMonth(startDate: string, offset: number): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !Number.isInteger(offset) || offset < 0) {
    throw new RangeError('Invalid lease date or month offset');
  }
  const [year, month, day] = startDate.split('-').map(Number);
  if (year === undefined || month === undefined || day === undefined || year < 100 || year > 9999) {
    throw new RangeError('Invalid lease date');
  }
  const original = new Date(Date.UTC(year, month - 1, day));
  if (original.toISOString().slice(0, 10) !== startDate) throw new RangeError('Invalid lease date');
  const target = new Date(Date.UTC(year, month - 1 + offset, 1));
  const lastDay = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)
  ).getUTCDate();
  target.setUTCDate(Math.min(day, lastDay));
  return target.toISOString().slice(0, 10);
}

/** Round VAT once per invoice to the nearest cent, half up, using integer arithmetic. */
export function invoiceAmounts(netCents: number, vatBasisPoints: number) {
  if (
    !Number.isSafeInteger(netCents) ||
    netCents < 0 ||
    !Number.isSafeInteger(vatBasisPoints) ||
    vatBasisPoints < 0
  ) {
    throw new RangeError('Amounts and VAT basis points must be non-negative integers');
  }
  const vat = (BigInt(netCents) * BigInt(vatBasisPoints) + 5000n) / 10000n;
  const vatCents = Number(vat);
  const totalCents = netCents + vatCents;
  if (!Number.isSafeInteger(totalCents))
    throw new RangeError('Invoice amount exceeds safe integer range');
  return { vatCents, totalCents };
}

/** Forecasts are not issued invoices: only a future issuance may lock the VAT snapshot. */
export function forecastInvoices(
  startDate: string,
  termMonths: number,
  monthlyNetCents: number,
  rates: readonly VatRate[]
): { ok: true; invoices: ForecastInvoice[] } | { ok: false; reason: 'missing_vat_rate' } {
  if (!Number.isInteger(termMonths) || termMonths < 1 || termMonths > 120)
    throw new RangeError('Invalid lease term');
  const invoices: ForecastInvoice[] = [];
  for (let month = 0; month < termMonths; month++) {
    const dueDate = dueDateForMonth(startDate, month);
    const rate = rates.find(
      (item) => item.valid_from <= dueDate && (item.valid_to === null || item.valid_to >= dueDate)
    );
    if (!rate) return { ok: false, reason: 'missing_vat_rate' };
    // The source stores percentages such as 25.5; convert once to exact basis points.
    const vatBasisPoints = Math.round(rate.rate_percent * 100);
    if (Math.abs(vatBasisPoints / 100 - rate.rate_percent) > 1e-9)
      throw new RangeError('VAT rate requires more than two decimal places');
    invoices.push({
      dueDate,
      netCents: monthlyNetCents,
      vatBasisPoints,
      ...invoiceAmounts(monthlyNetCents, vatBasisPoints),
    });
  }
  return { ok: true, invoices };
}

export function paymentStatus(
  totalCents: number,
  paidCents: number,
  dueDate: string,
  today: string
): 'paid' | 'partial' | 'overdue' | 'unpaid' {
  if (![totalCents, paidCents].every((value) => Number.isSafeInteger(value) && value >= 0))
    throw new RangeError('Amounts must be non-negative integer cents');
  if (paidCents >= totalCents) return 'paid';
  if (dueDate < today) return 'overdue';
  return paidCents > 0 ? 'partial' : 'unpaid';
}
