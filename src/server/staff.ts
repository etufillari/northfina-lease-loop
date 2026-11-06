// The staff desk: the queue of applications a person has to act on, and the two decisions
// staff can take on a manual review. Signing for an absent signatory reuses
// signApplication (src/server/contracts.ts) with the signatory's e-mail as the actor.
import { addDays } from '@/domain/calendar';
import type { Prisma, PrismaClient } from '@/generated/prisma/client';
import { withAudit } from '@/server/audit';
import { quoteAssetIds } from '@/server/quotes';

type Db = PrismaClient;

/** Statuses that wait for a person on the staff side. */
/** Holds owned by the waiting-list rules, which staff decisions leave alone. */
const WAITLIST_HOLDS = ['waitlist_offer'];

export const STAFF_QUEUE_STATUSES = ['manual_review', 'awaiting_signature'] as const;
export type StaffQueueStatus = (typeof STAFF_QUEUE_STATUSES)[number];

export type StaffQueueItem<Status extends string = StaffQueueStatus> = {
  applicationId: string;
  status: Status;
  customerId: string;
  customerName: string | null;
  /** Every item in the application: one, or a fleet of distinct items. */
  assets: Array<{ id: string; name: string | null }>;
  financedCents: number;
  termMonths: number;
  monthlyNetRentCents: number;
  /** The eligibility reasons stored at submission, exactly as the domain produced them. */
  decisionReasons: unknown;
  signatoryEmail: string | null;
  holdUntil: string | null;
  submittedAt: string;
};

/** An application row with its quote included. */
export type ApplicationWithQuote = Prisma.ApplicationGetPayload<{ include: { quote: true } }>;

/** Turns application rows into desk rows, with customer and item names looked up once. */
export async function describeApplications<Status extends string>(
  db: Db,
  applications: ApplicationWithQuote[]
): Promise<StaffQueueItem<Status>[]> {
  const customerIds = [...new Set(applications.map((a) => a.customer_id))];
  const assetIds = [...new Set(applications.flatMap((a) => quoteAssetIds(a.quote)))];
  const [customers, assets] = await Promise.all([
    db.customer.findMany({ where: { id: { in: customerIds } } }),
    db.asset.findMany({ where: { id: { in: assetIds } } }),
  ]);
  const customerName = new Map(customers.map((c) => [c.id, c.name]));
  const assetName = new Map(assets.map((a) => [a.id, `${a.make} ${a.model}`]));

  return applications.map((a) => ({
    applicationId: a.id,
    status: a.status as Status,
    customerId: a.customer_id,
    customerName: customerName.get(a.customer_id) ?? null,
    assets: quoteAssetIds(a.quote).map((id) => ({ id, name: assetName.get(id) ?? null })),
    financedCents: a.quote.financed_cents,
    termMonths: a.quote.term_months,
    monthlyNetRentCents: a.quote.monthly_net_rent_cents,
    decisionReasons: a.decision_reasons_json ? JSON.parse(a.decision_reasons_json) : null,
    signatoryEmail: a.signatory_email,
    holdUntil: a.hold_until,
    submittedAt: a.updated_at.toISOString(),
  }));
}

/** Everything waiting for staff, oldest first: first come, first served. */
export async function listStaffQueue(db: Db): Promise<StaffQueueItem[]> {
  const applications = await db.application.findMany({
    where: { status: { in: [...STAFF_QUEUE_STATUSES] } },
    include: { quote: true },
    orderBy: [{ updated_at: 'asc' }, { id: 'asc' }],
  });
  return describeApplications<StaffQueueStatus>(db, applications);
}

export type StaffDecisionResult =
  | { ok: true; status: 'approved' | 'awaiting_signature' | 'declined'; holdUntil: string | null }
  | { ok: false; reason: 'not_found' | 'not_reviewable' | 'self_decision' };

/**
 * A person approves a manual review. The 7-day hold restarts from the approval day, because
 * that is when the customer learns they can sign. A company applicant who may not sign still
 * goes to the signatory, exactly as an automatic approval would.
 */
export async function approveApplication(
  db: Db,
  input: { applicationId: string; actor: string; asOf: string; note?: string }
): Promise<StaffDecisionResult> {
  const application = await db.application.findUnique({
    where: { id: input.applicationId },
    include: { quote: true },
  });
  if (!application) return { ok: false, reason: 'not_found' };
  if (application.status !== 'manual_review') return { ok: false, reason: 'not_reviewable' };
  // Four-eyes rule: nobody decides on their own application.
  if (input.actor === application.customer_id) return { ok: false, reason: 'self_decision' };

  const answers = JSON.parse(application.answers_json) as Record<string, unknown>;
  const cannotSign = answers['q_customer_type'] === 'company' && answers['q_can_sign'] === 'no';
  const status = cannotSign ? 'awaiting_signature' : 'approved';
  const holdUntil = addDays(input.asOf, 7);
  const assetIds = quoteAssetIds(application.quote);

  await withAudit(
    db,
    {
      actor: input.actor,
      action: 'application.approved_by_staff',
      entityType: 'application',
      entityId: application.id,
      details: { from: 'manual_review', to: status, holdUntil, note: input.note },
    },
    async (tx) => {
      await tx.application.update({
        where: { id: application.id },
        data: { status, hold_until: holdUntil },
      });
      // Replace this customer's hold on every item with a fresh 7-day one. A waiting-list
      // offer hold stays: it ends by the waiting-list rules (signing closes the entry; an
      // offer that lapses is passed to the next person), see src/server/waitlist-actions.ts.
      for (const assetId of assetIds) {
        await tx.reservation.updateMany({
          where: {
            asset_id: assetId,
            customer_id: application.customer_id,
            active: true,
            kind: { notIn: WAITLIST_HOLDS },
          },
          data: { active: false },
        });
        await tx.reservation.create({
          data: {
            asset_id: assetId,
            customer_id: application.customer_id,
            kind: cannotSign ? 'awaiting_signatory' : 'approval_hold',
            until: holdUntil,
          },
        });
        await tx.asset.update({ where: { id: assetId }, data: { status: 'reserved' } });
      }
    }
  );
  return { ok: true, status, holdUntil };
}

/** A person declines: the application ends and its items are free for the next customer. */
export async function declineApplication(
  db: Db,
  input: { applicationId: string; actor: string; note?: string }
): Promise<StaffDecisionResult> {
  const application = await db.application.findUnique({
    where: { id: input.applicationId },
    include: { quote: true },
  });
  if (!application) return { ok: false, reason: 'not_found' };
  if (!(STAFF_QUEUE_STATUSES as readonly string[]).includes(application.status)) {
    return { ok: false, reason: 'not_reviewable' };
  }
  if (input.actor === application.customer_id) return { ok: false, reason: 'self_decision' };
  const assetIds = quoteAssetIds(application.quote);

  await withAudit(
    db,
    {
      actor: input.actor,
      action: 'application.declined_by_staff',
      entityType: 'application',
      entityId: application.id,
      details: { from: application.status, to: 'declined', note: input.note },
    },
    async (tx) => {
      await tx.application.update({
        where: { id: application.id },
        data: { status: 'declined', hold_until: null },
      });
      for (const assetId of assetIds) {
        await tx.reservation.updateMany({
          where: {
            asset_id: assetId,
            customer_id: application.customer_id,
            active: true,
            kind: { notIn: WAITLIST_HOLDS },
          },
          data: { active: false },
        });
        // Only release an item if no one else still holds it (a waiting-list offer still
        // holds it until it lapses and passes to the next person in line).
        const otherHolds = await tx.reservation.count({
          where: { asset_id: assetId, active: true },
        });
        const asset = await tx.asset.findUnique({ where: { id: assetId } });
        if (otherHolds === 0 && asset?.status === 'reserved') {
          await tx.asset.update({ where: { id: assetId }, data: { status: 'available' } });
        }
      }
    }
  );
  return { ok: true, status: 'declined', holdUntil: null };
}
