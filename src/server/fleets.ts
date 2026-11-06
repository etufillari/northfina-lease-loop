// Fleets on the server (see src/domain/fleet.ts for the rules): one application, decision and
// signature for several items. Each item gets its own application row and, once signed, its
// own contract, all sharing a fleet id. Applying and signing are each one transaction with
// one audit row, so a fleet is never half applied for or half signed.
import { randomUUID } from 'node:crypto';
import { loadCoefficientTable, loadQuestions } from '@/data/load';
import type { Asset } from '@/data/schemas';
import type { PrismaClient } from '@/generated/prisma/client';
import { decideApplication } from '@/domain/application';
import {
  checkFleet,
  fleetQuestionContext,
  fleetTotals,
  isBusinessApplicant,
  type FleetCheck,
  type FleetTotals,
} from '@/domain/fleet';
import type { LeaseQuote } from '@/domain/pricing';
import {
  actorFrom,
  applicationRow,
  listFleetApplications,
  priceItem,
  pricingData,
  type ApplicationDecisionStatus,
  type StoredApplication,
} from './applications';
import { withAudit } from './audit';
import {
  AssetTakenError,
  createContractIn,
  signingCheck,
  toContract,
  type Contract,
  type SignFailure,
} from './contracts';

export type SubmitFleetInput = {
  assetIds: string[];
  termMonths: number;
  answers: Record<string, string>;
  customerId: string | null;
};

export type SubmitFleetResult =
  | { ok: true; fleetId: string; decision: ApplicationDecisionStatus; applicationIds: string[] }
  | {
      ok: false;
      reason:
        | Extract<FleetCheck, { ok: false }>['reason']
        | 'business_only'
        | 'incomplete'
        | 'asset_not_found'
        | 'asset_not_available'
        | 'cannot_quote';
      assetId?: string;
    };

/**
 * Prices every item (no down payment in a fleet), decides the fleet as one deal and stores
 * one application per item with a `fleet.applied` audit row, in one transaction.
 */
export async function submitFleetApplication(
  db: PrismaClient,
  input: SubmitFleetInput,
  todayIso: string
): Promise<SubmitFleetResult> {
  if (!isBusinessApplicant(input.answers)) return { ok: false, reason: 'business_only' };
  const [data, questionsFile] = await Promise.all([pricingData(db, todayIso), loadQuestions()]);

  const priced: { asset: Asset; quote: LeaseQuote; priceListVersion: number }[] = [];
  for (const assetId of input.assetIds) {
    const item = await priceItem(
      db,
      data,
      { assetId, termMonths: input.termMonths, downPaymentCents: 0, customerId: input.customerId },
      todayIso
    );
    if (!item.ok) return { ok: false, reason: item.reason, assetId };
    priced.push(item);
  }
  const check = checkFleet(priced.map(({ asset }) => asset));
  if (!check.ok) return check;
  const category = priced[0]?.asset.category;
  if (!category) return { ok: false, reason: 'too_few' };

  const context = fleetQuestionContext({
    category,
    termMonths: input.termMonths,
    quotes: priced.map((item) => item.quote),
    todayIso,
  });
  const { answers, evaluation } = decideApplication(
    questionsFile.questions,
    input.answers,
    context
  );
  if (evaluation.status === 'incomplete') return { ok: false, reason: 'incomplete' };
  const decision = evaluation.status;
  const reasons = evaluation.reasons.map((reason) => reason.ruleId);

  const fleetId = randomUUID();
  const rows = priced.map((item) =>
    applicationRow({
      id: randomUUID(),
      todayIso,
      assetId: item.asset.id,
      customerId: input.customerId,
      answers,
      quote: item.quote,
      priceListVersion: item.priceListVersion,
      decision,
      reasons,
      fleetId,
    })
  );
  const totals = fleetTotals(priced.map((item) => item.quote));
  await withAudit(
    db,
    {
      actor: actorFrom(answers),
      action: 'fleet.applied',
      entityType: 'fleet',
      entityId: fleetId,
      details: {
        assetIds: rows.map((row) => row.asset_id),
        applicationIds: rows.map((row) => row.id),
        decision,
        reasons,
        termMonths: input.termMonths,
        financedCents: totals.financedCents,
        monthlyGrossCents: totals.monthlyGrossCents,
      },
    },
    (tx) => tx.application.createMany({ data: rows })
  );
  return { ok: true, fleetId, decision, applicationIds: rows.map((row) => row.id) };
}

export type Fleet = {
  id: string;
  customerId: string | null;
  applicantName: string | null;
  termMonths: number;
  quoteDate: string;
  decision: ApplicationDecisionStatus;
  reasons: StoredApplication['reasons'];
  applications: StoredApplication[];
  contracts: Contract[];
  totals: Omit<FleetTotals, 'monthlyVatCents' | 'totalGrossCents' | 'listPriceCents'>;
};

/** One fleet: its applications, its contracts once signed, and the totals. Or `null`. */
export async function getFleet(db: PrismaClient, fleetId: string): Promise<Fleet | null> {
  const applications = await listFleetApplications(db, fleetId);
  const first = applications[0];
  if (!first) return null;
  const rows = await db.contract.findMany({
    where: { fleet_id: fleetId },
    orderBy: { asset_id: 'asc' },
  });
  const sum = (pick: (a: StoredApplication) => number) =>
    applications.reduce((cents, a) => cents + pick(a), 0);
  return {
    id: fleetId,
    customerId: first.customerId,
    applicantName: first.applicantName,
    termMonths: first.termMonths,
    quoteDate: first.quoteDate,
    decision: first.decision,
    reasons: first.reasons,
    applications,
    contracts: rows.map(toContract),
    totals: {
      count: applications.length,
      financedCents: sum((a) => a.financedCents),
      monthlyNetCents: sum((a) => a.monthlyNetCents),
      monthlyGrossCents: sum((a) => a.monthlyGrossCents),
    },
  };
}

export type SignFleetResult =
  | { ok: true; contractIds: string[] }
  | { ok: false; reason: SignFailure | 'fleet_not_found'; assetId?: string };

/**
 * Signs every contract of an approved fleet at once, with a `fleet.signed` audit row. If any
 * item can't be signed (taken in the meantime, quote expired, later history) nothing is.
 */
export async function signFleet(
  db: PrismaClient,
  input: { fleetId: string; signerName: string },
  todayIso: string
): Promise<SignFleetResult> {
  const applications = await listFleetApplications(db, input.fleetId);
  if (applications.length === 0) return { ok: false, reason: 'fleet_not_found' };
  for (const application of applications) {
    const check = await signingCheck(db, application, todayIso);
    if (!check.ok) return { ok: false, reason: check.reason, assetId: application.assetId };
  }

  const table = await loadCoefficientTable();
  const signed = applications.map((application) => ({ id: randomUUID(), application }));
  const done = await withAudit(
    db,
    {
      actor: input.signerName,
      action: 'fleet.signed',
      entityType: 'fleet',
      entityId: input.fleetId,
      details: {
        contractIds: signed.map((s) => s.id),
        assetIds: applications.map((a) => a.assetId),
        monthlyNetCents: applications.reduce((cents, a) => cents + a.monthlyNetCents, 0),
      },
    },
    async (tx) => {
      for (const { id, application } of signed) {
        await createContractIn(tx, {
          id,
          application,
          signerName: input.signerName,
          todayIso,
          table,
          fleetId: input.fleetId,
        });
      }
      return true;
    }
  ).catch((error: unknown) => {
    if (error instanceof AssetTakenError) return false;
    throw error;
  });
  if (!done) return { ok: false, reason: 'asset_not_available' };
  return { ok: true, contractIds: signed.map((s) => s.id) };
}
