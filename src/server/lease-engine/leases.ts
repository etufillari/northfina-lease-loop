import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { PrismaClient } from '@/generated/prisma/client';
import { transitionLease } from '@/domain/lease-engine/lifecycle';
import type { LeaseTerms } from '@/domain/lease-engine/types';
import type { TransactionClient } from '@/server/audit';
import { auditedCommand } from './commands';
import {
  EngineServiceError,
  termsSchema,
  toLeaseDTO,
  type CommandContext,
  type LeaseDTO,
} from './contracts';

/** Contract owner calls this using withAudit's tx after signing/allocation guards.
 * This adapter owns only the engine row, never contract or asset state.
 */
export async function activateLeaseInTransaction(
  tx: TransactionClient,
  termsInput: LeaseTerms,
  activatedOn: string
): Promise<LeaseDTO> {
  const terms = termsSchema.parse(termsInput);
  const decision = transitionLease(null, 'ACTIVATE', terms, activatedOn);
  if (!decision.ok) throw new EngineServiceError('INVALID_TRANSITION', decision.reason);
  if (await tx.engineLease.findUnique({ where: { contractId: terms.contractId } })) {
    throw new EngineServiceError('LEASE_EXISTS');
  }
  return toLeaseDTO(
    await tx.engineLease.create({
      data: {
        id: randomUUID(),
        ...terms,
        status: decision.value,
      },
    })
  );
}

/** Internal fixture/integration entrypoint, not an authorized public activation route. */
export async function activateLease(
  db: PrismaClient,
  context: CommandContext,
  termsInput: LeaseTerms,
  activatedOn: string
): Promise<LeaseDTO> {
  const terms = termsSchema.parse(termsInput);
  const date = z.iso.date().parse(activatedOn);
  return auditedCommand(
    db,
    context,
    'activate',
    terms.contractId,
    { terms, activatedOn: date },
    (tx) => activateLeaseInTransaction(tx, terms, date)
  );
}

export async function getLease(db: PrismaClient, leaseId: string): Promise<LeaseDTO> {
  const row = await db.engineLease.findUnique({ where: { id: leaseId } });
  if (!row) throw new EngineServiceError('NOT_FOUND');
  return toLeaseDTO(row);
}

/** Allows contract owner to synchronize contract state in this SAME audited transaction. */
export async function completeLeaseInTransaction(
  tx: TransactionClient,
  leaseId: string,
  asOf: string,
  expectedVersion: number
): Promise<LeaseDTO> {
  const row = await tx.engineLease.findUnique({ where: { id: leaseId } });
  if (!row) throw new EngineServiceError('NOT_FOUND');
  if (row.version !== expectedVersion) throw new EngineServiceError('VERSION_CONFLICT');
  const lease = toLeaseDTO(row);
  const decision = transitionLease(lease.status, 'COMPLETE', lease, asOf);
  if (!decision.ok) throw new EngineServiceError('INVALID_TRANSITION', decision.reason);
  const changed = await tx.engineLease.updateMany({
    where: { id: leaseId, version: expectedVersion },
    data: { status: decision.value, version: { increment: 1 } },
  });
  if (changed.count !== 1) throw new EngineServiceError('VERSION_CONFLICT');
  return toLeaseDTO(await tx.engineLease.findUniqueOrThrow({ where: { id: leaseId } }));
}

export async function completeLease(
  db: PrismaClient,
  context: CommandContext,
  leaseId: string,
  asOf: string,
  expectedVersion: number
): Promise<LeaseDTO> {
  const payload = z
    .strictObject({
      leaseId: z.string().min(1),
      asOf: z.iso.date(),
      expectedVersion: z.number().int().positive(),
    })
    .parse({ leaseId, asOf, expectedVersion });
  return auditedCommand(db, context, 'complete', leaseId, payload, (tx) =>
    completeLeaseInTransaction(tx, payload.leaseId, payload.asOf, payload.expectedVersion)
  );
}
