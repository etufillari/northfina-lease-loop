import { loadCoefficientTable } from '@/data/load';
import type { UpdateWaitingInput } from '@/data/waiting-list-schemas';
import { mayJoinWaitingList } from '@/domain/waiting-list';
import { ApiError } from './api-response';
import { withAudit } from './audit';
import type { DemoContext } from './demo-context';
import type { PrismaClient } from './prisma-client';
import { rethrowDatabaseConflict, requestHash, requireSameRequest } from './request-integrity';

export async function updateWaitingRequest(
  db: PrismaClient,
  context: DemoContext,
  id: string,
  input: UpdateWaitingInput
) {
  const fingerprint = requestHash({ customerId: context.customer.id, id, input });
  const existing = await db.waitingRequest.findFirst({
    where: { id, customer_id: context.customer.id },
  });
  if (!existing) throw new ApiError(404, 'WAITING_REQUEST_NOT_FOUND', 'The request was not found');
  if (existing.update_request_id === input.requestId) {
    requireSameRequest(existing.update_request_hash, fingerprint);
    return { id };
  }
  if (
    existing.status !== 'pending' ||
    existing.revision !== input.revision ||
    existing.submitted_on > context.businessDate
  ) {
    throw new ApiError(409, 'WAITING_REQUEST_CHANGED', 'Refresh the request before editing');
  }
  const table = await loadCoefficientTable();
  const allowed = mayJoinWaitingList({
    ...input,
    onDate: context.businessDate,
    supportedTerms: Object.keys(table.end_of_term_buyout_percent_of_financed).map(Number),
  });
  if (!allowed.ok)
    throw new ApiError(422, 'WAITING_INPUT_INVALID', 'Check the waiting-list preferences', {
      reason: allowed.reason,
    });
  try {
    await withAudit(
      db,
      {
        actor: context.actor,
        action: 'waiting.updated',
        entityType: 'waiting_request',
        entityId: id,
        details: {
          businessDate: context.businessDate,
          revision: input.revision + 1,
          before: {
            minCondition: existing.min_condition,
            monthlyBudgetCents: existing.max_monthly_net_rent_cents,
            termMonths: existing.preferred_term_months,
            neededBy: existing.needed_by,
          },
          after: {
            minCondition: input.minCondition,
            monthlyBudgetCents: input.monthlyBudgetCents,
            termMonths: input.termMonths,
            neededBy: input.neededBy,
          },
        },
      },
      async (tx) => {
        const updated = await tx.waitingRequest.updateMany({
          where: {
            id,
            customer_id: context.customer.id,
            status: 'pending',
            revision: input.revision,
          },
          data: {
            min_condition: input.minCondition,
            max_monthly_net_rent_cents: input.monthlyBudgetCents,
            preferred_term_months: input.termMonths,
            needed_by: input.neededBy,
            revision: { increment: 1 },
            update_request_id: input.requestId,
            update_request_hash: fingerprint,
          },
        });
        if (updated.count !== 1)
          throw new ApiError(409, 'WAITING_REQUEST_CHANGED', 'The request changed while editing');
      }
    );
  } catch (error) {
    const committed = await db.waitingRequest.findUnique({ where: { id } });
    if (
      committed?.customer_id === context.customer.id &&
      committed.update_request_id === input.requestId
    ) {
      requireSameRequest(committed.update_request_hash, fingerprint);
      return { id };
    }
    rethrowDatabaseConflict(error);
  }
  return { id };
}
