import type { Invoice as InvoiceRow, Payment as PaymentRow } from '@/generated/prisma/client';
import { invoiceStatusSchema } from '@/data/schemas';
import { paymentStateFor } from '@/domain/payments';

export type InvoiceWithPayments = InvoiceRow & { payments: PaymentRow[] };

export type PaymentRecord = {
  id: string;
  invoiceId: string;
  amountCents: number;
  paidOn: string;
  reference: string | null;
  createdAt: string;
};

export function toDomainPayments(rows: readonly PaymentRow[]) {
  return rows.map((row) => ({ amountCents: row.amount_cents, paidOn: row.paid_on }));
}

export type InvoiceRecord = {
  id: string;
  contractId: string;
  sequence: number;
  status: 'issued' | 'paid' | 'overdue' | 'cancelled';
  paymentStatus: 'unpaid' | 'partially_paid' | 'paid';
  totalPaidCents: number;
  remainingCents: number;
  isOverdue: boolean;
  payments: PaymentRecord[];
  periodStart: string;
  periodEnd: string;
  dueOn: string;
  netRentCents: number;
  vatRateBasisPoints: number;
  vatCents: number;
  totalCents: number;
  issuedAt: string;
  paidAt: string | null;
};

export function toPaymentRecord(row: PaymentRow): PaymentRecord {
  return {
    id: row.id,
    invoiceId: row.invoice_id,
    amountCents: row.amount_cents,
    paidOn: row.paid_on,
    reference: row.reference,
    createdAt: row.created_at.toISOString(),
  };
}

export function toInvoiceRecord(row: InvoiceWithPayments, asOf: string): InvoiceRecord {
  const payments = [...row.payments]
    .sort(
      (a, b) =>
        a.paid_on.localeCompare(b.paid_on) || a.created_at.getTime() - b.created_at.getTime()
    )
    .map(toPaymentRecord);
  const state = paymentStateFor({
    totalCents: row.total_cents,
    dueOn: row.due_on,
    payments: toDomainPayments(row.payments),
    asOf,
  });

  return {
    id: row.id,
    contractId: row.contract_id,
    sequence: row.sequence,
    status: invoiceStatusSchema.parse(row.status),
    paymentStatus: state.status,
    totalPaidCents: state.totalPaidCents,
    remainingCents: state.remainingCents,
    isOverdue: state.isOverdue,
    payments,
    periodStart: row.period_start,
    periodEnd: row.period_end,
    dueOn: row.due_on,
    netRentCents: row.net_rent_cents,
    vatRateBasisPoints: row.vat_rate_basis_points,
    vatCents: row.vat_cents,
    totalCents: row.total_cents,
    issuedAt: row.issued_at.toISOString(),
    paidAt: row.paid_at?.toISOString() ?? null,
  };
}
