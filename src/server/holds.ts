// Holds on the server: a customer asks for an item that isn't free yet to be held for them
// (with what they need from it), and a customer lets a hold go when they change their mind.
// Staff hold an item for a customer who asked when it is refurbished (see second-life.ts).
// The rules are in src/domain/holds.ts. Every change is dated and audited, in one transaction.
import type { AssetCondition } from '@/data/schemas';
import type { PrismaClient } from '@/generated/prisma/client';
import { loadCoefficientTable } from '@/data/load';
import { canRequestHold, checkHoldRequest, holdStatusOn, type HoldStatus } from '@/domain/holds';
import { leaseTerms } from '@/domain/pricing';
import { assetOn, hasLaterHistory } from './asset-state';
import { withAudit } from './audit';

export type HoldRequest = {
  id: string;
  assetId: string;
  customerId: string;
  requestedDate: string;
  termMonths: number;
  maxMonthlyCents: number;
  minCondition: AssetCondition;
  /** On the app's date. */
  status: HoldStatus;
};

type HoldRow = Awaited<ReturnType<PrismaClient['holdRequest']['findMany']>>[number];

function toHoldRequest(row: HoldRow, todayIso: string): HoldRequest {
  return {
    id: row.id,
    assetId: row.asset_id,
    customerId: row.customer_id,
    requestedDate: row.requested_date,
    termMonths: row.term_months,
    maxMonthlyCents: row.max_monthly_cents,
    minCondition: row.min_condition as AssetCondition,
    status: holdStatusOn({ heldDate: row.held_date, withdrawnDate: row.withdrawn_date }, todayIso),
  };
}

/** The requests made by `todayIso` that are still open then (waiting or held), oldest first. */
export async function listHoldRequests(
  db: PrismaClient,
  filter: { assetId?: string; customerId?: string },
  todayIso: string
): Promise<HoldRequest[]> {
  const rows = await db.holdRequest.findMany({
    where: {
      requested_date: { lte: todayIso },
      ...(filter.assetId ? { asset_id: filter.assetId } : {}),
      ...(filter.customerId ? { customer_id: filter.customerId } : {}),
    },
    orderBy: [{ requested_date: 'asc' }, { created_at: 'asc' }],
  });
  return rows.map((row) => toHoldRequest(row, todayIso)).filter((r) => r.status !== 'withdrawn');
}

export type RequestHoldInput = {
  assetId: string;
  customerId: string;
  termMonths: number;
  maxMonthlyCents: number;
  minCondition: string;
  actor: string;
};

export type RequestHoldResult =
  | { ok: true; request: HoldRequest }
  | {
      ok: false;
      reason:
        | 'not_found'
        | 'later_history'
        | 'not_holdable'
        | 'already_requested'
        | 'unknown_term'
        | 'invalid_budget'
        | 'unknown_condition';
    };

/** A customer asks for a leased item, or one waiting for its check, to be held for them. */
export async function requestHold(
  db: PrismaClient,
  input: RequestHoldInput,
  todayIso: string
): Promise<RequestHoldResult> {
  const item = await assetOn(db, input.assetId, todayIso);
  if (!item) return { ok: false, reason: 'not_found' };
  if (item.laterHistory) return { ok: false, reason: 'later_history' };
  if (
    !canRequestHold({ status: item.asset.status, reservedFor: item.reservedFor }, input.customerId)
  ) {
    return { ok: false, reason: 'not_holdable' };
  }
  const problem = checkHoldRequest(input, leaseTerms(await loadCoefficientTable()));
  if (problem) return { ok: false, reason: problem };
  const open = await listHoldRequests(
    db,
    { assetId: input.assetId, customerId: input.customerId },
    todayIso
  );
  if (open.length > 0) return { ok: false, reason: 'already_requested' };

  const row = await withAudit(
    db,
    {
      actor: input.actor,
      action: 'hold.requested',
      entityType: 'asset',
      entityId: input.assetId,
      details: {
        customerId: input.customerId,
        termMonths: input.termMonths,
        maxMonthlyCents: input.maxMonthlyCents,
        minCondition: input.minCondition,
      },
    },
    (tx) =>
      tx.holdRequest.create({
        data: {
          asset_id: input.assetId,
          customer_id: input.customerId,
          requested_date: todayIso,
          term_months: input.termMonths,
          max_monthly_cents: input.maxMonthlyCents,
          min_condition: input.minCondition,
          status: 'waiting',
        },
      })
  );
  return { ok: true, request: toHoldRequest(row, todayIso) };
}

export type ReleaseHoldResult =
  | { ok: true; released: 'request' | 'hold' }
  | { ok: false; reason: 'not_found' | 'later_history' | 'nothing_to_release' };

/**
 * The customer changes their mind about an item: a request still waiting is withdrawn, and an
 * item held for them (from a request, or a pass-on they accepted) is let go. A refurbished item
 * is then free for anyone; one still waiting for its check is refurbished for anyone.
 */
export async function releaseHold(
  db: PrismaClient,
  input: { assetId: string; customerId: string; actor: string },
  todayIso: string
): Promise<ReleaseHoldResult> {
  const row = await db.asset.findUnique({ where: { id: input.assetId } });
  if (!row) return { ok: false, reason: 'not_found' };
  if (await hasLaterHistory(db, input.assetId, todayIso)) {
    return { ok: false, reason: 'later_history' };
  }
  const heldForThem = row.reserved_for === input.customerId;
  const [requests, handover] = await Promise.all([
    listHoldRequests(db, { assetId: input.assetId, customerId: input.customerId }, todayIso),
    db.handover.findFirst({
      where: {
        asset_id: input.assetId,
        to_customer_id: input.customerId,
        status: 'accepted',
        released_date: null,
      },
    }),
  ]);
  if (!heldForThem && requests.length === 0) return { ok: false, reason: 'nothing_to_release' };

  await withAudit(
    db,
    {
      actor: input.actor,
      action: heldForThem ? 'hold.released' : 'hold.withdrawn',
      entityType: 'asset',
      entityId: input.assetId,
      details: { customerId: input.customerId },
    },
    async (tx) => {
      for (const request of requests) {
        await tx.holdRequest.update({
          where: { id: request.id },
          data: { status: 'withdrawn', withdrawn_date: todayIso },
        });
      }
      if (!heldForThem) return;
      if (handover) {
        await tx.handover.update({ where: { id: handover.id }, data: { released_date: todayIso } });
      }
      await tx.asset.update({
        where: { id: input.assetId },
        data: {
          reserved_for: null,
          ...(row.status === 'reserved' ? { status: 'available' } : {}),
        },
      });
    }
  );
  return { ok: true, released: heldForThem ? 'hold' : 'request' };
}
