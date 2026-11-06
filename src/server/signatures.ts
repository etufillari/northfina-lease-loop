// Card 6: applications waiting for the company's signatory, and what the signatory does with
// them (admin, Signatures, acting as the person the request was sent to; no real email is
// sent). A request is one application, or one whole fleet. Signing creates the contracts on
// the applicant's account, so the invoices go to the applicant; declining records who, when
// and why. The rules are in src/domain/signature.ts.
import type { PrismaClient } from '@/generated/prisma/client';
import {
  signatoryEmail,
  signatureStatus,
  signatureValidUntil,
  type SignatureStatus,
} from '@/domain/signature';
import { toStoredApplication, type StoredApplication } from './applications';
import { withAudit } from './audit';
import { signContract, type SignFailure } from './contracts';
import { signFleet } from './fleets';

export type SignatureRequest = {
  /** The application id, or the fleet id for a fleet. */
  id: string;
  kind: 'application' | 'fleet';
  status: SignatureStatus;
  signatoryEmail: string | null;
  /** Who applied: their account gets the contract and the invoices. */
  applicant: {
    customerId: string | null;
    name: string;
    company: string | null;
    email: string | null;
  };
  assetIds: string[];
  termMonths: number;
  monthlyNetCents: number;
  monthlyGrossCents: number;
  quoteDate: string;
  validUntil: string;
  /** The other reasons a person must review it, when status is needs_review. */
  otherReasons: StoredApplication['reasons'];
  contractIds: string[];
  signedDate: string | null;
  declined: { date: string; by: string | null; note: string | null } | null;
  /** Something happened to it after `today` (time travel): look only, don't change. */
  laterHistory: boolean;
};

/** Every signature request as it stands on `today`, newest first. */
export async function listSignatureRequests(
  db: PrismaClient,
  today: string
): Promise<SignatureRequest[]> {
  const rows = await db.application.findMany({
    where: { reasons_json: { contains: 'signatory_authorization' } },
    orderBy: [{ created_at: 'desc' }, { asset_id: 'asc' }],
  });
  const groups = new Map<string, StoredApplication[]>();
  for (const application of rows.map(toStoredApplication)) {
    const key = application.fleetId ?? application.id;
    groups.set(key, [...(groups.get(key) ?? []), application]);
  }
  const requests = await Promise.all(
    [...groups.values()].map((applications) => toRequest(db, applications, today))
  );
  return requests.filter((request): request is SignatureRequest => request !== null);
}

/** One request (an application id or a fleet id) on `today`, or null. */
export async function getSignatureRequest(
  db: PrismaClient,
  id: string,
  today: string
): Promise<SignatureRequest | null> {
  const rows = await db.application.findMany({
    where: { OR: [{ id }, { fleet_id: id }] },
    orderBy: { asset_id: 'asc' },
  });
  const applications = rows.map(toStoredApplication);
  // A fleet is only reachable by its fleet id, never through one of its applications.
  const first = applications[0];
  if (!first || (first.fleetId !== null && first.fleetId !== id)) return null;
  return toRequest(db, applications, today);
}

async function toRequest(
  db: PrismaClient,
  applications: StoredApplication[],
  today: string
): Promise<SignatureRequest | null> {
  const first = applications[0];
  if (!first) return null;
  const contracts = await db.contract.findMany({
    where: { application_id: { in: applications.map((a) => a.id) } },
    orderBy: { asset_id: 'asc' },
  });
  // Signed means every item was signed (a fleet is all-or-nothing), from that day on.
  const signedDate =
    contracts.length === applications.length ? (contracts[0]?.signed_date ?? null) : null;
  const declined = first.signatureDeclined;
  const status = signatureStatus({
    decision: first.decision,
    reasons: first.reasons,
    quoteDate: first.quoteDate,
    signedDate,
    declinedDate: declined?.date ?? null,
    today,
  });
  if (status === null) return null;
  const signedToday = signedDate !== null && signedDate <= today;
  const sum = (pick: (a: StoredApplication) => number) =>
    applications.reduce((cents, a) => cents + pick(a), 0);

  return {
    id: first.fleetId ?? first.id,
    kind: first.fleetId ? 'fleet' : 'application',
    status,
    signatoryEmail: signatoryEmail(first.answers),
    applicant: {
      customerId: first.customerId,
      name: first.answers.q_full_name?.trim() || first.applicantName || '—',
      company: first.answers.q_company_name?.trim() || null,
      email: first.answers.q_email?.trim() || null,
    },
    assetIds: applications.map((a) => a.assetId),
    termMonths: first.termMonths,
    monthlyNetCents: sum((a) => a.monthlyNetCents),
    monthlyGrossCents: sum((a) => a.monthlyGrossCents),
    quoteDate: first.quoteDate,
    validUntil: signatureValidUntil(first.quoteDate),
    otherReasons: first.reasons.filter((reason) => reason !== 'signatory_authorization'),
    contractIds: signedToday ? contracts.map((c) => c.id) : [],
    signedDate: signedToday ? signedDate : null,
    declined: declined && declined.date <= today ? declined : null,
    laterHistory:
      (signedDate !== null && signedDate > today) || (declined !== null && declined.date > today),
  };
}

export type SignatoryFailure = SignFailure | 'fleet_not_found' | 'not_waiting';

export type SignatoryResult =
  { ok: true; contractIds: string[] } | { ok: false; reason: SignatoryFailure; assetId?: string };

/**
 * The signatory signs request `id` on `today`, typing their name. The contracts are created
 * on the applicant's account (their customer id), so the invoices go to the applicant.
 */
export async function signAsSignatory(
  db: PrismaClient,
  input: { id: string; signerName: string },
  today: string
): Promise<SignatoryResult> {
  const request = await getSignatureRequest(db, input.id, today);
  if (!request) return { ok: false, reason: 'application_not_found' };
  if (request.laterHistory) return { ok: false, reason: 'later_history' };
  if (request.status !== 'waiting' || !request.signatoryEmail) {
    return { ok: false, reason: request.status === 'expired' ? 'quote_expired' : 'not_waiting' };
  }
  const signatory = { email: request.signatoryEmail };
  if (request.kind === 'fleet') {
    const result = await signFleet(
      db,
      { fleetId: request.id, signerName: input.signerName },
      today,
      signatory
    );
    return result.ok ? { ok: true, contractIds: result.contractIds } : result;
  }
  const result = await signContract(
    db,
    { applicationId: request.id, signerName: input.signerName },
    today,
    signatory
  );
  return result.ok
    ? { ok: true, contractIds: [result.contract.id] }
    : { ok: false, reason: result.reason };
}

/**
 * The signatory declines request `id` on `today`, with an optional note for the applicant.
 * Every application of a fleet is declined together, with one `signature.declined` audit row.
 */
export async function declineAsSignatory(
  db: PrismaClient,
  input: { id: string; note: string | null },
  today: string
): Promise<{ ok: true } | { ok: false; reason: SignatoryFailure }> {
  const request = await getSignatureRequest(db, input.id, today);
  if (!request) return { ok: false, reason: 'application_not_found' };
  if (request.laterHistory) return { ok: false, reason: 'later_history' };
  if (request.status !== 'waiting') return { ok: false, reason: 'not_waiting' };
  const note = input.note?.trim() || null;
  await withAudit(
    db,
    {
      actor: request.signatoryEmail ?? 'signatory',
      action: 'signature.declined',
      entityType: request.kind,
      entityId: request.id,
      details: { assetIds: request.assetIds, note },
    },
    (tx) =>
      tx.application.updateMany({
        where: request.kind === 'fleet' ? { fleet_id: request.id } : { id: request.id },
        data: {
          signature_declined_date: today,
          signature_declined_by: request.signatoryEmail,
          signature_decline_note: note,
        },
      })
  );
  return { ok: true };
}
