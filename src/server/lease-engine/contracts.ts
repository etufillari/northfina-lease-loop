import { z } from 'zod';
import type { EngineLease, EngineInvoice } from '@/generated/prisma/client';
import type { LeaseTerms } from '@/domain/lease-engine/types';

const id = z.string().trim().min(1).max(100);
const cents = z.number().int().nonnegative().max(2_147_483_647);
export const termsSchema = z.strictObject({
  contractId: id,
  assetId: id,
  customerId: id,
  startDate: z.iso.date(),
  termMonths: z.union([z.literal(12), z.literal(24), z.literal(36), z.literal(48)]),
  monthlyNetCents: cents,
  paymentDueDays: z.number().int().min(0).max(60),
});
export const contextSchema = z.strictObject({ actor: id, idempotencyKey: id });
export type CommandContext = z.infer<typeof contextSchema>;

export type LeaseDTO = LeaseTerms & {
  leaseId: string;
  status: 'ACTIVE' | 'COMPLETED' | 'TERMINATED';
  version: number;
};
export type InvoiceDTO = {
  invoiceId: string;
  number: string;
  leaseId: string;
  periodIndex: number;
  issueDate: string;
  dueDate: string;
  endDateExclusive: string;
  netCents: number;
  vatCents: number;
  grossCents: number;
  currency: 'EUR';
  tax: { rateBps: number; validFrom: string; validTo: string | null; fictional: boolean };
  status: 'ISSUED';
  issuedAt: string;
};
const statusSchema = z.enum(['ACTIVE', 'COMPLETED', 'TERMINATED']);
const taxSchema = z.strictObject({
  rateBps: z.number().int().min(0).max(10000),
  validFrom: z.iso.date(),
  validTo: z.iso.date().nullable(),
  fictional: z.boolean(),
});

export function toLeaseDTO(row: EngineLease): LeaseDTO {
  return {
    ...termsSchema.parse({
      contractId: row.contractId,
      assetId: row.assetId,
      customerId: row.customerId,
      startDate: row.startDate,
      termMonths: row.termMonths,
      monthlyNetCents: row.monthlyNetCents,
      paymentDueDays: row.paymentDueDays,
    }),
    leaseId: row.id,
    status: statusSchema.parse(row.status),
    version: row.version,
  };
}
export function toInvoiceDTO(row: EngineInvoice): InvoiceDTO {
  return {
    invoiceId: row.id,
    number: row.number,
    leaseId: row.leaseId,
    periodIndex: row.periodIndex,
    issueDate: row.issueDate,
    dueDate: row.dueDate,
    endDateExclusive: row.endDateExclusive,
    netCents: row.netCents,
    vatCents: row.vatCents,
    grossCents: row.grossCents,
    currency: 'EUR',
    tax: taxSchema.parse(JSON.parse(row.taxJson)),
    status: z.literal('ISSUED').parse(row.status),
    issuedAt: row.issuedAt.toISOString(),
  };
}

export class EngineServiceError extends Error {
  constructor(
    readonly code:
      | 'NOT_FOUND'
      | 'INVALID_TRANSITION'
      | 'IDEMPOTENCY_CONFLICT'
      | 'LEASE_EXISTS'
      | 'INVOICE_EXISTS'
      | 'VERSION_CONFLICT'
      | 'INVALID_CALCULATION',
    readonly reason?: string
  ) {
    super(code);
    this.name = 'EngineServiceError';
  }
}
