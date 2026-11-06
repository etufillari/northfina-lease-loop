import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { PrismaClient } from '@/generated/prisma/client';
import { vatRateSchema, type VatRate } from '@/data/schemas';
import { calculateInvoice } from '@/domain/lease-engine/invoice';
import { auditedCommand } from './commands';
import {
  EngineServiceError,
  toLeaseDTO,
  toInvoiceDTO,
  type CommandContext,
  type InvoiceDTO,
} from './contracts';

export async function issueInvoice(
  db: PrismaClient,
  context: CommandContext,
  input: { leaseId: string; periodIndex: number },
  ratesInput: readonly VatRate[]
): Promise<InvoiceDTO> {
  const payload = z
    .strictObject({ leaseId: z.string().min(1), periodIndex: z.number().int().positive() })
    .parse(input);
  // Rules are supplied by the trusted server provider, not by the HTTP caller.
  // They are intentionally excluded from request identity: replay returns the original tax snapshot.
  const rates = z.array(vatRateSchema).parse(ratesInput);
  return auditedCommand(db, context, 'issue_invoice', payload.leaseId, payload, async (tx) => {
    const row = await tx.engineLease.findUnique({ where: { id: payload.leaseId } });
    if (!row) throw new EngineServiceError('NOT_FOUND');
    const lease = toLeaseDTO(row);
    if (lease.status === 'TERMINATED') throw new EngineServiceError('INVALID_TRANSITION');
    if (
      await tx.engineInvoice.findUnique({
        where: {
          leaseId_periodIndex: { leaseId: payload.leaseId, periodIndex: payload.periodIndex },
        },
      })
    )
      throw new EngineServiceError('INVOICE_EXISTS');
    const calculated = calculateInvoice(lease, payload.periodIndex, rates);
    if (!calculated.ok) throw new EngineServiceError('INVALID_CALCULATION', calculated.reason);
    const invoice = calculated.value;
    if (invoice.grossCents > 2_147_483_647)
      throw new EngineServiceError('INVALID_CALCULATION', 'amount_overflow');
    const year = Number(invoice.period.issueDate.slice(0, 4));
    const counter = await tx.engineInvoiceCounter.upsert({
      where: { year },
      create: { year, last: 1 },
      update: { last: { increment: 1 } },
    });
    return toInvoiceDTO(
      await tx.engineInvoice.create({
        data: {
          id: randomUUID(),
          number: `LL-${year}-${String(counter.last).padStart(6, '0')}`,
          leaseId: lease.leaseId,
          periodIndex: payload.periodIndex,
          issueDate: invoice.period.issueDate,
          dueDate: invoice.period.dueDate,
          endDateExclusive: invoice.period.endDateExclusive,
          netCents: invoice.netCents,
          vatCents: invoice.vatCents,
          grossCents: invoice.grossCents,
          taxJson: JSON.stringify(invoice.tax),
        },
      })
    );
  });
}

export async function listLeaseInvoices(db: PrismaClient, leaseId: string): Promise<InvoiceDTO[]> {
  if (!(await db.engineLease.findUnique({ where: { id: leaseId } })))
    throw new EngineServiceError('NOT_FOUND');
  return (
    await db.engineInvoice.findMany({ where: { leaseId }, orderBy: { periodIndex: 'asc' } })
  ).map(toInvoiceDTO);
}
