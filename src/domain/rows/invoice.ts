// The write schema of an `Invoice` row (prisma/schema.prisma). The practice repo held these
// rules as CHECK constraints (`Invoice_gross_is_net_plus_vat`); here Zod holds them (D27).
import { z } from 'zod';
import { splitVat } from '../money-math';
import { invoiceKindSchema, invoiceStatusSchema } from '../statuses';
import { centsSchema, idSchema, isoDateSchema, ON_VALID_FIELDS, vatRateBpSchema } from './fields';

export const invoiceRowSchema = z
  .strictObject({
    id: idSchema.optional(),
    contract_id: idSchema,
    /** 0 for the down payment (D5), then 1, 2, 3 … within the contract. */
    sequence: z.number().int().nonnegative(),
    /** Null for an invoice that is not for a period (down payment, buyout, early exit). */
    period_start: isoDateSchema.nullable(),
    period_end: isoDateSchema.nullable(),
    issue_date: isoDateSchema,
    due_date: isoDateSchema,
    net_cents: centsSchema,
    vat_rate_bp: vatRateBpSchema,
    vat_cents: centsSchema,
    gross_cents: centsSchema,
    kind: invoiceKindSchema,
    status: invoiceStatusSchema,
    paid_on: isoDateSchema.nullable().optional(),
  })
  .superRefine((row, ctx) => {
    const issue = (path: string, message: string) =>
      ctx.addIssue({ code: 'custom', message, path: [path] });
    // VAT is rounded from the net, once per invoice line (D1); the gross is net + VAT.
    const vat = splitVat(row.net_cents, row.vat_rate_bp);
    if (row.vat_cents !== vat.vatCents)
      issue('vat_cents', 'VAT is not net × rate, rounded half up');
    if (row.gross_cents !== row.net_cents + row.vat_cents)
      issue('gross_cents', 'gross is not net + VAT');

    const hasPeriod = row.period_start !== null || row.period_end !== null;
    if (row.kind === 'rent') {
      if (row.period_start === null || row.period_end === null) {
        issue('period_start', 'a rent invoice is for a period');
      } else if (row.period_end < row.period_start) {
        issue('period_end', 'the period ends before it starts');
      }
    } else if (hasPeriod) {
      issue('period_start', `a ${row.kind} invoice is not for a period`);
    }
    if (row.due_date < row.issue_date) issue('due_date', 'due before it is issued');

    const paidOn = row.paid_on ?? null;
    if ((row.status === 'paid') !== (paidOn !== null)) {
      issue('paid_on', 'only a paid invoice has a paid day');
    }
  }, ON_VALID_FIELDS);
export type InvoiceRow = z.infer<typeof invoiceRowSchema>;
