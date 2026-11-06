import { createHash, randomUUID } from 'node:crypto';
import type { PrismaClient } from '@/generated/prisma/client';
import { withAudit, type TransactionClient } from '@/server/audit';
import { contextSchema, EngineServiceError, type CommandContext } from './contracts';

/** IDs, clocks, receipts and retries stay outside the pure engine. */
export async function auditedCommand<T>(
  db: PrismaClient,
  context: CommandContext,
  operation: string,
  entityId: string,
  payload: unknown,
  work: (tx: TransactionClient) => Promise<T>,
  auditDetails: Readonly<Record<string, unknown>> = {}
): Promise<T> {
  const { actor, idempotencyKey: key } = contextSchema.parse(context);
  const payloadHash = createHash('sha256').update(JSON.stringify(payload)).digest('hex');
  for (let attempt = 0; ; attempt++) {
    try {
      return await withAudit(
        db,
        {
          actor,
          action: `engine.${operation}_command`,
          entityType: operation.startsWith('circular_')
            ? 'asset'
            : operation === 'activate' || operation === 'activate_contract'
              ? 'contract'
              : 'lease',
          entityId,
          details: { ...auditDetails, idempotencyKey: key },
        },
        async (tx) => {
          const receipt = await tx.engineCommandReceipt.findUnique({
            where: { actor_operation_key: { actor, operation, key } },
          });
          if (receipt) {
            if (receipt.payloadHash !== payloadHash)
              throw new EngineServiceError('IDEMPOTENCY_CONFLICT');
            return JSON.parse(receipt.resultJson) as T;
          }
          const result = await work(tx);
          await tx.engineCommandReceipt.create({
            data: {
              id: randomUUID(),
              actor,
              operation,
              key,
              payloadHash,
              resultJson: JSON.stringify(result),
            },
          });
          return result;
        }
      );
    } catch (error) {
      const code =
        error !== null && typeof error === 'object' && 'code' in error ? error.code : undefined;
      if (attempt >= 2 || !['P2002', 'P2034', 'P1008', 'SQLITE_BUSY'].includes(String(code)))
        throw error;
    }
  }
}
