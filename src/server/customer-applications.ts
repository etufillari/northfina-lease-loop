// A customer's open applications: everything not yet a contract and not finished, so "My
// page" can lead them back, above all to sign after staff approves a manual review.
import type { PrismaClient } from '@/generated/prisma/client';
import { quoteAssetIds } from '@/server/quotes';

type Db = PrismaClient;

export const OPEN_APPLICATION_STATUSES = [
  'draft',
  'manual_review',
  'approved',
  'awaiting_signature',
] as const;
export type OpenApplicationStatus = (typeof OPEN_APPLICATION_STATUSES)[number];

/**
 * What the customer can do next:
 * - `continue`: a draft with questions left;
 * - `sign`: approved and still inside the 7-day hold;
 * - `wait_for_review`: a person is checking it;
 * - `wait_for_signatory`: the company's signatory has to sign;
 * - `expired`: the hold ran out before signing (signing would be refused).
 */
export type NextStep = 'continue' | 'sign' | 'wait_for_review' | 'wait_for_signatory' | 'expired';

export type CustomerApplication = {
  applicationId: string;
  status: OpenApplicationStatus;
  nextStep: NextStep;
  /** Every item in the application: one, or a fleet of distinct items. */
  assets: Array<{ id: string; name: string | null }>;
  termMonths: number;
  monthlyNetRentCents: number;
  holdUntil: string | null;
  signatoryEmail: string | null;
  isTransfer: boolean;
};

/** Which step is next, given the status, the hold and the as-of date ("today"). */
export function nextStepFor(
  status: OpenApplicationStatus,
  holdUntil: string | null,
  asOf: string
): NextStep {
  // ISO dates compare as strings; the hold includes its last day (as in signApplication).
  const holdOver = holdUntil !== null && asOf > holdUntil;
  switch (status) {
    case 'draft':
      return 'continue';
    case 'manual_review':
      return 'wait_for_review';
    case 'approved':
      return holdOver ? 'expired' : 'sign';
    case 'awaiting_signature':
      return holdOver ? 'expired' : 'wait_for_signatory';
  }
}

/** The customer's open applications, the ones they can act on first, then newest first. */
export async function listCustomerOpenApplications(
  db: Db,
  customerId: string,
  asOf: string
): Promise<CustomerApplication[]> {
  const applications = await db.application.findMany({
    where: { customer_id: customerId, status: { in: [...OPEN_APPLICATION_STATUSES] } },
    include: { quote: true },
    orderBy: [{ updated_at: 'desc' }, { id: 'asc' }],
  });
  const assetIds = [...new Set(applications.flatMap((a) => quoteAssetIds(a.quote)))];
  const assets = await db.asset.findMany({ where: { id: { in: assetIds } } });
  const assetName = new Map(assets.map((a) => [a.id, `${a.make} ${a.model}`]));

  const rows = applications.map((a): CustomerApplication => {
    const status = a.status as OpenApplicationStatus;
    return {
      applicationId: a.id,
      status,
      nextStep: nextStepFor(status, a.hold_until, asOf),
      assets: quoteAssetIds(a.quote).map((id) => ({ id, name: assetName.get(id) ?? null })),
      termMonths: a.quote.term_months,
      monthlyNetRentCents: a.quote.monthly_net_rent_cents,
      holdUntil: a.hold_until,
      signatoryEmail: a.signatory_email,
      isTransfer: a.transfer_contract_id !== null,
    };
  });
  // "Sign" and "continue" need the customer; stable sort keeps newest-first within groups.
  const actionable = (step: NextStep) => (step === 'sign' || step === 'continue' ? 0 : 1);
  return rows.sort((a, b) => actionable(a.nextStep) - actionable(b.nextStep));
}
