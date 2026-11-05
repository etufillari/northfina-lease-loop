// Handling lease application submissions.
import type { PrismaClient } from '@/generated/prisma/client';
import { withAudit } from './audit';
import { todayIso } from './today';

export type SubmitApplicationInput = {
  assetId?: string;
  termMonths?: number;
  monthlyRentCents?: number;
  answers: Record<string, unknown>;
  actor?: string;
};

export type SubmittedApplication = {
  id: string;
  status: 'received';
  assetId: string;
  termMonths: number;
  monthlyRentCents: number;
  submittedAt: string;
  answers: Record<string, unknown>;
};

export async function submitApplication(
  db: PrismaClient,
  input: SubmitApplicationInput
): Promise<SubmittedApplication> {
  const applicationId = `app-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  const assetId = input.assetId ?? 'ebike-003';
  const termMonths = input.termMonths ?? 36;
  const monthlyRentCents = input.monthlyRentCents ?? 10730;
  const actor = input.actor ?? 'applicant';

  return withAudit(
    db,
    {
      actor,
      action: 'application.submitted',
      entityType: 'application',
      entityId: applicationId,
      details: {
        assetId,
        termMonths,
        monthlyRentCents,
        answersCount: Object.keys(input.answers).length,
      },
    },
    async () => {
      return {
        id: applicationId,
        status: 'received',
        assetId,
        termMonths,
        monthlyRentCents,
        submittedAt: todayIso(),
        answers: input.answers,
      };
    }
  );
}
