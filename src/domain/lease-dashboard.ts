import type { VatRate } from '@/data/schemas';
import { holderShareCents, type CoLeaseShare } from './co-lease';
import { dueDateForMonth, forecastInvoices, invoiceAmounts, paymentStatus } from './lease-billing';

type Payment = { amountCents: number; isSimulated: boolean };
type Invoice = {
  dueDate: string;
  netCents: number;
  vatCents: number;
  status: string;
  payments: Payment[];
};
export type LeaseForSummary = {
  startDate: string;
  termMonths: number;
  monthlyNetCents: number;
  listPriceCents: number;
  downPaymentCents: number;
  isDemo: boolean;
  invoices: Invoice[];
  coLeaseShares?: readonly CoLeaseShare[];
};

/** Simulated payments count only on explicitly marked demo leases. */
export function paidForInvoice(invoice: Invoice, isDemo: boolean): number {
  return invoice.payments
    .filter((payment) => isDemo || !payment.isSimulated)
    .reduce((sum, payment) => sum + payment.amountCents, 0);
}

export function summarizeLease(lease: LeaseForSummary, rates: readonly VatRate[], today: string) {
  if (
    !Number.isSafeInteger(lease.listPriceCents) ||
    !Number.isSafeInteger(lease.downPaymentCents) ||
    lease.downPaymentCents < 0 ||
    lease.downPaymentCents > lease.listPriceCents
  )
    throw new RangeError('Invalid agreed price');
  const issued = lease.invoices.filter((invoice) => invoice.status === 'issued');
  const paidCents = issued.reduce((sum, invoice) => sum + paidForInvoice(invoice, lease.isDemo), 0);
  const billedCents = issued.reduce((sum, invoice) => sum + invoice.netCents + invoice.vatCents, 0);
  const outstandingCents = issued.reduce(
    (sum, invoice) =>
      sum +
      Math.max(0, invoice.netCents + invoice.vatCents - paidForInvoice(invoice, lease.isDemo)),
    0
  );
  const forecast = forecastInvoices(
    lease.startDate,
    lease.termMonths,
    lease.monthlyNetCents,
    rates
  );
  const issuedByDueDate = new Map(issued.map((invoice) => [invoice.dueDate, invoice]));
  const startVatBasisPoints = forecast.ok ? forecast.invoices[0]?.vatBasisPoints : undefined;
  const downPaymentTotalCents =
    startVatBasisPoints === undefined
      ? null
      : invoiceAmounts(lease.downPaymentCents, startVatBasisPoints).totalCents;
  const forecastTotalCents =
    forecast.ok && downPaymentTotalCents !== null
      ? forecast.invoices.reduce((sum, invoice) => {
          const actual = issuedByDueDate.get(invoice.dueDate);
          return sum + (actual ? actual.netCents + actual.vatCents : invoice.totalCents);
        }, downPaymentTotalCents)
      : null;
  const datesIssued = new Set(issued.map((invoice) => invoice.dueDate));
  const unpaid = issued.flatMap((invoice) => {
    const total = invoice.netCents + invoice.vatCents;
    const paid = paidForInvoice(invoice, lease.isDemo);
    return paid < total
      ? [
          {
            dueDate: invoice.dueDate,
            amountCents: total - paid,
            kind: 'issued' as const,
            status: paymentStatus(total, paid, invoice.dueDate, today),
          },
        ]
      : [];
  });
  const upcoming = forecast.ok
    ? forecast.invoices
        .filter((invoice) => invoice.dueDate >= today && !datesIssued.has(invoice.dueDate))
        .map((invoice) => ({
          dueDate: invoice.dueDate,
          amountCents: invoice.totalCents,
          kind: 'forecast' as const,
          status: 'forecast' as const,
        }))
    : [];
  const earliest =
    [...unpaid, ...upcoming].sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0] ?? null;
  const next = earliest && {
    ...earliest,
    /** What the lease holder pays of this amount once a co-lease split applies. */
    shareCents: holderShareCents(earliest.amountCents, lease.coLeaseShares ?? [], earliest.dueDate),
  };
  const shares = lease.coLeaseShares ?? [];
  const unissued = forecast.ok
    ? forecast.invoices.filter((invoice) => !datesIssued.has(invoice.dueDate))
    : [];
  /** What this customer has paid and still has to pay in rent, after any co-lease split. */
  const yourPaidCents = issued.reduce(
    (sum, invoice) =>
      sum + holderShareCents(paidForInvoice(invoice, lease.isDemo), shares, invoice.dueDate),
    0
  );
  const yourRemainingCents = [
    ...unpaid.map((item) => ({ cents: item.amountCents, date: item.dueDate })),
    ...unissued.map((item) => ({ cents: item.totalCents, date: item.dueDate })),
  ].reduce((sum, item) => sum + holderShareCents(item.cents, shares, item.date), 0);
  const elapsed =
    today < lease.startDate
      ? 0
      : Math.min(
          lease.termMonths,
          Math.max(
            0,
            Array.from({ length: lease.termMonths + 1 }, (_, offset) =>
              dueDateForMonth(lease.startDate, offset)
            ).filter((date) => date <= today).length - 1
          )
        );
  return {
    paidCents,
    billedCents,
    outstandingCents,
    next,
    yourPaidCents,
    yourRemainingCents,
    paymentsLeft: unpaid.length + unissued.length,
    elapsedMonths: elapsed,
    endDate: dueDateForMonth(lease.startDate, lease.termMonths),
    forecast,
    forecastTotalCents,
    downPaymentTotalCents,
    financedCents: lease.listPriceCents - lease.downPaymentCents,
  };
}

export function summarizePortfolio(
  leases: readonly (LeaseForSummary & { status: string })[],
  rates: readonly VatRate[],
  today: string
) {
  const summaries = leases.map((lease) => ({
    lease,
    summary: summarizeLease(lease, rates, today),
  }));
  const realPaidCents = summaries
    .filter(({ lease }) => !lease.isDemo)
    .reduce((sum, item) => sum + item.summary.paidCents, 0);
  const demoPaidCents = summaries
    .filter(({ lease }) => lease.isDemo)
    .reduce((sum, item) => sum + item.summary.paidCents, 0);
  const outstandingCents = summaries
    .filter(({ lease }) => !lease.isDemo)
    .reduce((sum, item) => sum + item.summary.outstandingCents, 0);
  const demoOutstandingCents = summaries
    .filter(({ lease }) => lease.isDemo)
    .reduce((sum, item) => sum + item.summary.outstandingCents, 0);
  const next =
    summaries
      .filter(({ lease }) => lease.status === 'active')
      .flatMap(({ lease, summary }) =>
        summary.next ? [{ ...summary.next, demo: lease.isDemo }] : []
      )
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0] ?? null;
  return {
    activeCount: leases.filter((lease) => lease.status === 'active').length,
    realPaidCents,
    demoPaidCents,
    demoOutstandingCents,
    outstandingCents,
    next,
  };
}
