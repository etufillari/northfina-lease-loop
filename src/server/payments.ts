import { randomUUID } from 'node:crypto';
import { isoDateSchema } from '@/data/schemas';
import { applyPaymentFor, type PaymentFailure } from '@/domain/payments';
import { todayIso } from './today';
import { withAudit, type TransactionClient } from './audit';
import {
  toInvoiceRecord,
  toDomainPayments,
  toPaymentRecord,
  type InvoiceRecord,
  type InvoiceWithPayments,
  type PaymentRecord,
} from './invoice-record';
import type { PrismaClient } from './prisma-client';
import { z } from 'zod';

export const paymentRequestSchema = z.strictObject({
  amountCents: z.number().int().positive(),
  paidOn: isoDateSchema,
  reference: z.string().trim().max(200).optional(),
  actor: z.string().trim().min(1).max(100),
});

export type PaymentRequest = z.infer<typeof paymentRequestSchema>;

export type PaymentRecordingFailure =
  | { ok: false; reason: 'contract_not_found' }
  | { ok: false; reason: 'invoice_not_found' }
  | { ok: false; reason: 'invoice_cancelled' }
  | PaymentFailure;

export type PaymentRecordingResult =
  { ok: true; payment: PaymentRecord; invoice: InvoiceRecord } | PaymentRecordingFailure;

export type InvoicePaymentsResult =
  | { ok: true; invoice: InvoiceRecord }
  | Extract<PaymentRecordingFailure, { reason: 'contract_not_found' | 'invoice_not_found' }>;

class PaymentTransactionFailure extends Error {
  constructor(readonly failure: PaymentRecordingFailure) {
    super('The invoice changed while recording the payment');
    this.name = 'PaymentTransactionFailure';
  }
}

async function findContract(db: PrismaClient, contractId: string) {
  return db.contract.findUnique({ where: { id: contractId } });
}

async function findInvoice(
  db: PrismaClient | TransactionClient,
  contractId: string,
  invoiceId: string
): Promise<InvoiceWithPayments | null> {
  return db.invoice.findFirst({
    where: { id: invoiceId, contract_id: contractId },
    include: { payments: true },
  });
}

function domainPayment(input: PaymentRequest) {
  return { amountCents: input.amountCents, paidOn: input.paidOn };
}

function failureFromPayment(failure: PaymentFailure): PaymentRecordingFailure {
  return failure;
}

/** Records one full or partial payment against one invoice in an audited transaction. */
export async function recordPayment(
  db: PrismaClient,
  input: PaymentRequest & { contractId: string; invoiceId: string },
  asOf = todayIso()
): Promise<PaymentRecordingResult> {
  const contract = await findContract(db, input.contractId);
  if (!contract) return { ok: false, reason: 'contract_not_found' };

  const existing = await findInvoice(db, input.contractId, input.invoiceId);
  if (!existing) return { ok: false, reason: 'invoice_not_found' };
  if (existing.status === 'cancelled') return { ok: false, reason: 'invoice_cancelled' };

  const preflight = applyPaymentFor({
    totalCents: existing.total_cents,
    dueOn: existing.due_on,
    payments: toDomainPayments(existing.payments),
    payment: domainPayment(input),
    asOf,
  });
  if (!preflight.ok) return failureFromPayment(preflight);

  const paymentId = randomUUID();
  try {
    const result = await withAudit(
      db,
      {
        actor: input.actor,
        action: 'invoice.payment_recorded',
        entityType: 'invoice',
        entityId: existing.id,
        details: {
          paymentId,
          amountCents: input.amountCents,
          paidOn: input.paidOn,
          reference: input.reference ?? null,
        },
      },
      async (tx) => {
        const current = await findInvoice(tx, input.contractId, input.invoiceId);
        if (!current) {
          throw new PaymentTransactionFailure({ ok: false, reason: 'invoice_not_found' });
        }
        if (current.status === 'cancelled') {
          throw new PaymentTransactionFailure({ ok: false, reason: 'invoice_cancelled' });
        }

        const applied = applyPaymentFor({
          totalCents: current.total_cents,
          dueOn: current.due_on,
          payments: toDomainPayments(current.payments),
          payment: domainPayment(input),
          asOf,
        });
        if (!applied.ok) throw new PaymentTransactionFailure(failureFromPayment(applied));

        const payment = await tx.payment.create({
          data: {
            id: paymentId,
            invoice_id: current.id,
            amount_cents: input.amountCents,
            paid_on: input.paidOn,
            reference: input.reference ?? null,
          },
        });
        const updated = await tx.invoice.update({
          where: { id: current.id },
          data: {
            status: applied.state.status === 'paid' ? 'paid' : current.status,
            paid_at: applied.state.status === 'paid' ? new Date() : current.paid_at,
          },
        });

        return {
          payment,
          invoice: { ...updated, payments: [...current.payments, payment] },
        };
      }
    );

    return {
      ok: true,
      payment: toPaymentRecord(result.payment),
      invoice: toInvoiceRecord(result.invoice, asOf),
    };
  } catch (error) {
    if (error instanceof PaymentTransactionFailure) return error.failure;
    throw error;
  }
}

/** Returns one invoice with its payment history and current balance. */
export async function listInvoicePayments(
  db: PrismaClient,
  input: { contractId: string; invoiceId: string },
  asOf = todayIso()
): Promise<InvoicePaymentsResult> {
  const contract = await findContract(db, input.contractId);
  if (!contract) return { ok: false, reason: 'contract_not_found' };

  const invoice = await findInvoice(db, input.contractId, input.invoiceId);
  if (!invoice) return { ok: false, reason: 'invoice_not_found' };

  return { ok: true, invoice: toInvoiceRecord(invoice, asOf) };
}
