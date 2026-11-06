import type { PrismaClient } from '@/generated/prisma/client';
import { calculateBillingSchedule } from '@/domain/lease-engine/calendar';
import type { BillingPeriod } from '@/domain/lease-engine/types';
import {
  EngineServiceError,
  toInvoiceDTO,
  toLeaseDTO,
  type InvoiceDTO,
  type LeaseDTO,
} from './contracts';
import { getLease } from './leases';

/** Internal lookup for the contract adapter; route callers must first authorize access. */
export async function getLeaseByContract(db: PrismaClient, contractId: string): Promise<LeaseDTO> {
  const row = await db.engineLease.findUnique({ where: { contractId } });
  if (!row) throw new EngineServiceError('NOT_FOUND');
  return toLeaseDTO(row);
}

/** Returns the stored issued result, never a recalculation using current tax rules. */
export async function getInvoice(db: PrismaClient, invoiceId: string): Promise<InvoiceDTO> {
  const row = await db.engineInvoice.findUnique({ where: { id: invoiceId } });
  if (!row) throw new EngineServiceError('NOT_FOUND');
  return toInvoiceDTO(row);
}

/** Projection from stored signed terms; does not issue or persist invoices. */
export async function getLeaseSchedule(
  db: PrismaClient,
  leaseId: string
): Promise<{
  leaseId: string;
  contractId: string;
  currency: 'EUR';
  periods: readonly BillingPeriod[];
  totalNetCents: number;
}> {
  const lease = await getLease(db, leaseId);
  const schedule = calculateBillingSchedule(lease);
  if (!schedule.ok) throw new EngineServiceError('INVALID_CALCULATION', schedule.reason);
  return {
    leaseId,
    contractId: lease.contractId,
    currency: 'EUR',
    periods: schedule.value,
    totalNetCents: schedule.value.reduce((total, period) => total + period.netCents, 0),
  };
}
