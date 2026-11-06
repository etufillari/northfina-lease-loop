import { loadCoefficientTable } from '@/data/load';
import type { JoinWaitingInput } from '@/data/waiting-list-schemas';
import { mayJoinWaitingList } from '@/domain/waiting-list';
import { ApiError } from './api-response';
import { withAudit } from './audit';
import type { DemoContext } from './demo-context';
import type { PrismaClient } from './prisma-client';
import { rethrowDatabaseConflict, requestHash, requireSameRequest } from './request-integrity';

export async function listOwnWaitingRequests(db: PrismaClient, context: DemoContext) {
  return db.waitingRequest.findMany({
    where: { customer_id: context.customer.id },
    orderBy: [{ submitted_on: 'desc' }, { id: 'asc' }],
    select: {
      id: true,
      revision: true,
      category: true,
      min_condition: true,
      max_monthly_net_rent_cents: true,
      preferred_term_months: true,
      needed_by: true,
      submitted_on: true,
      status: true,
      allocated_asset_id: true,
    },
  });
}

export async function joinWaitingList(
  db: PrismaClient,
  context: DemoContext,
  input: JoinWaitingInput
) {
  const fingerprint = requestHash({ customerId: context.customer.id, input });
  const existing = await db.waitingRequest.findUnique({ where: { id: input.requestId } });
  if (existing) {
    if (existing.customer_id !== context.customer.id)
      throw new ApiError(404, 'WAITING_REQUEST_NOT_FOUND', 'The request was not found');
    requireSameRequest(existing.request_hash, fingerprint);
    return { id: existing.id };
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
  const pendingKey = `${context.customer.id}:${input.category}`;
  try {
    await withAudit(
      db,
      {
        actor: context.actor,
        action: 'waiting.joined',
        entityType: 'waiting_request',
        entityId: input.requestId,
        details: { category: input.category, businessDate: context.businessDate },
      },
      async (tx) => {
        if (await tx.waitingRequest.findUnique({ where: { pending_key: pendingKey } }))
          throw new ApiError(
            409,
            'WAITING_REQUEST_EXISTS',
            'Edit the current pending request instead of joining again'
          );
        await tx.waitingRequest.create({
          data: {
            id: input.requestId,
            customer_id: context.customer.id,
            submitted_on: context.businessDate,
            request_hash: fingerprint,
            category: input.category,
            min_condition: input.minCondition,
            max_monthly_net_rent_cents: input.monthlyBudgetCents,
            preferred_term_months: input.termMonths,
            needed_by: input.neededBy,
            pending_key: pendingKey,
          },
        });
      }
    );
  } catch (error) {
    const committed = await db.waitingRequest.findUnique({ where: { id: input.requestId } });
    if (committed?.customer_id === context.customer.id) {
      requireSameRequest(committed.request_hash, fingerprint);
      return { id: committed.id };
    }
    rethrowDatabaseConflict(error);
  }
  return { id: input.requestId };
}

export async function cancelWaitingRequest(db: PrismaClient, context: DemoContext, id: string) {
  const request = await db.waitingRequest.findFirst({
    where: { id, customer_id: context.customer.id },
  });
  if (!request) throw new ApiError(404, 'WAITING_REQUEST_NOT_FOUND', 'The request was not found');
  if (request.status === 'cancelled') return { id };
  if (request.status !== 'pending')
    throw new ApiError(409, 'WAITING_REQUEST_CHANGED', 'The request has already been allocated');
  await withAudit(
    db,
    {
      actor: context.actor,
      action: 'waiting.cancelled',
      entityType: 'waiting_request',
      entityId: id,
    },
    async (tx) => {
      const updated = await tx.waitingRequest.updateMany({
        where: { id, customer_id: context.customer.id, status: 'pending' },
        data: { status: 'cancelled', pending_key: null },
      });
      if (updated.count !== 1)
        throw new ApiError(409, 'WAITING_REQUEST_CHANGED', 'Refresh the waiting list');
    }
  );
  return { id };
}
