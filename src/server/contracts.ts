// Signing and reading lease contracts. Signing copies the price from the approved
// application into the contract and never recalculates it, so a price list that changes
// after the quote (laptops −8 % from 6 Nov) can't change what the customer agreed to.
import { randomUUID } from 'node:crypto';
import type { Contract as ContractRow, PrismaClient } from '@/generated/prisma/client';
import { loadCoefficientTable } from '@/data/load';
import { checkSignable, contractPeriod } from '@/domain/contract';
import { signerMatchesApplicant } from '@/domain/names';
import { waitsOnlyForSignatory } from '@/domain/signature';
import { contractOn } from '@/domain/state-on';
import { hasLaterHistory } from './asset-state';
import { percentOfCents } from '@/domain/money';
import type { CoefficientTable } from '@/data/schemas';
import { getApplication, type StoredApplication } from './applications';
import { withAudit, type TransactionClient } from './audit';

export type Contract = {
  id: string;
  applicationId: string;
  assetId: string;
  customerId: string | null;
  signedDate: string;
  signerName: string;
  customerType: string;
  customerName: string;
  customerEmail: string | null;
  businessId: string | null;
  startDate: string;
  endDate: string;
  termMonths: number;
  quoteDate: string;
  priceListVersion: number;
  listPriceCents: number;
  downPaymentCents: number;
  financedCents: number;
  monthlyNetCents: number;
  buyoutCents: number;
  status: string;
  returnedDate: string | null;
  boughtDate: string | null;
  buyoutPaidCents: number | null;
  /** Set when the lease was ended before its last day; invoices after it are cancelled. */
  exitedEarlyDate: string | null;
  exitFeeCents: number | null;
  /** Set when it was signed as part of a fleet. */
  fleetId: string | null;
};

export function toContract(row: ContractRow): Contract {
  return {
    id: row.id,
    applicationId: row.application_id,
    assetId: row.asset_id,
    customerId: row.customer_id,
    signedDate: row.signed_date,
    signerName: row.signer_name,
    customerType: row.customer_type,
    customerName: row.customer_name,
    customerEmail: row.customer_email,
    businessId: row.business_id,
    startDate: row.start_date,
    endDate: row.end_date,
    termMonths: row.term_months,
    quoteDate: row.quote_date,
    priceListVersion: row.price_list_version,
    listPriceCents: row.list_price_cents,
    downPaymentCents: row.down_payment_cents,
    financedCents: row.financed_cents,
    monthlyNetCents: row.monthly_net_cents,
    buyoutCents: row.buyout_cents,
    status: row.status,
    returnedDate: row.returned_date,
    boughtDate: row.bought_date,
    buyoutPaidCents: row.buyout_paid_cents,
    exitedEarlyDate: row.exited_early_date,
    exitFeeCents: row.exit_fee_cents,
    fleetId: row.fleet_id,
  };
}

export async function getContract(db: PrismaClient, id: string): Promise<Contract | null> {
  const row = await db.contract.findUnique({ where: { id } });
  return row ? toContract(row) : null;
}

/**
 * Contracts, newest first: all of them, or only those of one customer (`null` = made by a guest).
 * With `today`, as they were on that date: not yet signed ones left out, later endings undone.
 */
export async function listContracts(
  db: PrismaClient,
  filter: { customerId: string | null } | null = null,
  today?: string
): Promise<Contract[]> {
  const rows = await db.contract.findMany({
    where: filter ? { customer_id: filter.customerId } : {},
    orderBy: { created_at: 'desc' },
  });
  const contracts = rows.map(toContract);
  if (!today) return contracts;
  return contracts.flatMap((contract) => contractOn(contract, today) ?? []);
}

/** The contract signed from an application, if there is one. */
export async function getContractForApplication(
  db: PrismaClient,
  applicationId: string
): Promise<Contract | null> {
  const row = await db.contract.findUnique({ where: { application_id: applicationId } });
  return row ? toContract(row) : null;
}

/** Thrown inside the signing transaction when the item was taken in the meantime. */
export class AssetTakenError extends Error {}

export type SignFailure =
  | 'application_not_found'
  | 'already_signed'
  | 'not_approved'
  | 'quote_expired'
  | 'signed_before_quote'
  | 'asset_not_available'
  | 'later_history'
  | 'part_of_fleet'
  | 'name_mismatch'
  /** The company's signatory declined to sign it. */
  | 'declined';

export type SignContractResult =
  { ok: true; contract: Contract } | { ok: false; reason: SignFailure; contractId?: string };

/**
 * Whether `application` can be signed on `todayIso` by `signerName`: not yet signed, approved,
 * quote valid, and signed with the full name given in the application (see names.ts).
 * With `asSignatory`, the company's signatory signs (card 6): an application that went to
 * manual review only because the applicant may not sign counts as approved for them, and
 * their name isn't the applicant's, so it isn't compared.
 */
export async function signingCheck(
  db: PrismaClient,
  application: StoredApplication,
  todayIso: string,
  { signerName, asSignatory = false }: { signerName: string; asSignatory?: boolean }
): Promise<{ ok: true } | { ok: false; reason: SignFailure; contractId?: string }> {
  const existing = await getContractForApplication(db, application.id);
  if (existing) return { ok: false, reason: 'already_signed', contractId: existing.id };
  if (application.signatureDeclined) {
    // Declined later than today (time travel): it is still waiting then, but can't change.
    return {
      ok: false,
      reason: application.signatureDeclined.date > todayIso ? 'later_history' : 'declined',
    };
  }
  const signatoryMaySign =
    asSignatory && waitsOnlyForSignatory(application.decision, application.reasons);
  const check = checkSignable({
    decision: signatoryMaySign ? 'approved' : application.decision,
    quoteDate: application.quoteDate,
    signDate: todayIso,
  });
  if (!check.ok) return { ok: false, reason: check.reason };
  if (!asSignatory && !signerMatchesApplicant(signerName, application.answers.q_full_name)) {
    return { ok: false, reason: 'name_mismatch' };
  }
  if (await hasLaterHistory(db, application.assetId, todayIso)) {
    return { ok: false, reason: 'later_history' };
  }
  return { ok: true };
}

/**
 * Inside a signing transaction: creates the contract with the price copied from the
 * application, and takes the item. Throws AssetTakenError (rolling everything back) when the
 * item can no longer be leased, e.g. someone else signed for it a moment ago.
 */
export async function createContractIn(
  tx: TransactionClient,
  input: {
    id: string;
    application: StoredApplication;
    signerName: string;
    todayIso: string;
    table: CoefficientTable;
    fleetId?: string;
  }
): Promise<ContractRow> {
  const { application, signerName, todayIso } = input;
  // The buyout is fixed at signing too, from the coefficient table in force today.
  const buyoutPercent =
    input.table.end_of_term_buyout_percent_of_financed[String(application.termMonths)] ?? 0;
  const { startDate, endDate } = contractPeriod(todayIso, application.termMonths);
  const answers = application.answers;
  const contract = await tx.contract.create({
    data: {
      id: input.id,
      application_id: application.id,
      asset_id: application.assetId,
      customer_id: application.customerId,
      signed_date: todayIso,
      signer_name: signerName,
      customer_type: application.customerType,
      customer_name: answers.q_company_name?.trim() || application.applicantName || signerName,
      customer_email: answers.q_email?.trim() || null,
      business_id: answers.q_business_id?.trim() || null,
      start_date: startDate,
      end_date: endDate,
      term_months: application.termMonths,
      quote_date: application.quoteDate,
      price_list_version: application.priceListVersion,
      list_price_cents: application.listPriceCents,
      down_payment_cents: application.downPaymentCents,
      financed_cents: application.financedCents,
      monthly_net_cents: application.monthlyNetCents,
      buyout_cents: percentOfCents(application.financedCents, buyoutPercent),
      status: 'active',
      fleet_id: input.fleetId ?? null,
    },
  });
  // Take the item only if it can still be leased, in the same write: if someone else signed
  // for it a moment ago, nothing is updated and the whole signing rolls back. An item reserved
  // for this customer (passed on to them) can be taken by them only.
  const taken = await tx.asset.updateMany({
    where: {
      id: application.assetId,
      OR: [
        { status: 'available' },
        ...(application.customerId
          ? [{ status: 'reserved', reserved_for: application.customerId }]
          : []),
      ],
    },
    data: { status: 'leased', reserved_for: null },
  });
  if (taken.count === 0) throw new AssetTakenError();
  return contract;
}

/**
 * Signs the contract for an approved application on `todayIso`. In one transaction it
 * creates the contract with the locked price, marks the item as leased and writes a
 * `contract.signed` audit row. An application can be signed once.
 */
export async function signContract(
  db: PrismaClient,
  input: { applicationId: string; signerName: string },
  todayIso: string,
  /** The company's signatory signing for the applicant (card 6), and their email. */
  signatory?: { email: string }
): Promise<SignContractResult> {
  const application = await getApplication(db, input.applicationId);
  if (!application) return { ok: false, reason: 'application_not_found' };
  // A fleet is signed as a whole (see fleets.ts), never one item at a time.
  if (application.fleetId) return { ok: false, reason: 'part_of_fleet' };
  const check = await signingCheck(db, application, todayIso, {
    signerName: input.signerName,
    asSignatory: !!signatory,
  });
  if (!check.ok) return check;

  const table = await loadCoefficientTable();
  const id = randomUUID();
  const row = await withAudit(
    db,
    {
      actor: signatory ? `${input.signerName} <${signatory.email}>` : input.signerName,
      action: 'contract.signed',
      entityType: 'contract',
      entityId: id,
      details: {
        applicationId: application.id,
        assetId: application.assetId,
        monthlyNetCents: application.monthlyNetCents,
        priceListVersion: application.priceListVersion,
        quoteDate: application.quoteDate,
        ...(signatory ? { signedBy: 'signatory', signatoryEmail: signatory.email } : {}),
      },
    },
    (tx) => createContractIn(tx, { id, application, signerName: input.signerName, todayIso, table })
  ).catch((error: unknown) => {
    if (error instanceof AssetTakenError) return null;
    throw error;
  });
  if (!row) return { ok: false, reason: 'asset_not_available' };
  return { ok: true, contract: toContract(row) };
}

/** Every contract of one item, oldest first: its lives in Lease Loop's own records. */
export async function listContractsForAsset(
  db: PrismaClient,
  assetId: string
): Promise<Contract[]> {
  const rows = await db.contract.findMany({
    where: { asset_id: assetId },
    orderBy: { start_date: 'asc' },
  });
  return rows.map(toContract);
}
