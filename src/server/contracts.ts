// Signing and reading lease contracts. Signing copies the price from the approved
// application into the contract and never recalculates it, so a price list that changes
// after the quote (laptops −8 % from 6 Nov) can't change what the customer agreed to.
import { randomUUID } from 'node:crypto';
import type { Contract as ContractRow, PrismaClient } from '@/generated/prisma/client';
import { loadCoefficientTable } from '@/data/load';
import { checkSignable, contractPeriod } from '@/domain/contract';
import { percentOfCents } from '@/domain/money';
import { getApplication } from './applications';
import { withAudit } from './audit';

export type Contract = {
  id: string;
  applicationId: string;
  assetId: string;
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
};

function toContract(row: ContractRow): Contract {
  return {
    id: row.id,
    applicationId: row.application_id,
    assetId: row.asset_id,
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
  };
}

export async function getContract(db: PrismaClient, id: string): Promise<Contract | null> {
  const row = await db.contract.findUnique({ where: { id } });
  return row ? toContract(row) : null;
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
class AssetTakenError extends Error {}

export type SignContractResult =
  | { ok: true; contract: Contract }
  | {
      ok: false;
      reason:
        | 'application_not_found'
        | 'already_signed'
        | 'not_approved'
        | 'quote_expired'
        | 'signed_before_quote'
        | 'asset_not_available';
      contractId?: string;
    };

/**
 * Signs the contract for an approved application on `todayIso`. In one transaction it
 * creates the contract with the locked price, marks the item as taken (`reserved`) and
 * writes a `contract.signed` audit row. An application can be signed once.
 */
export async function signContract(
  db: PrismaClient,
  input: { applicationId: string; signerName: string },
  todayIso: string
): Promise<SignContractResult> {
  const application = await getApplication(db, input.applicationId);
  if (!application) return { ok: false, reason: 'application_not_found' };

  const existing = await getContractForApplication(db, application.id);
  if (existing) return { ok: false, reason: 'already_signed', contractId: existing.id };

  const check = checkSignable({
    decision: application.decision,
    quoteDate: application.quoteDate,
    signDate: todayIso,
  });
  if (!check.ok) return { ok: false, reason: check.reason };

  // The buyout is fixed at signing too, from the coefficient table in force today.
  const table = await loadCoefficientTable();
  const buyoutPercent =
    table.end_of_term_buyout_percent_of_financed[String(application.termMonths)] ?? 0;
  const { startDate, endDate } = contractPeriod(todayIso, application.termMonths);
  const answers = application.answers;
  const id = randomUUID();

  const row = await withAudit(
    db,
    {
      actor: input.signerName,
      action: 'contract.signed',
      entityType: 'contract',
      entityId: id,
      details: {
        applicationId: application.id,
        assetId: application.assetId,
        monthlyNetCents: application.monthlyNetCents,
        priceListVersion: application.priceListVersion,
        quoteDate: application.quoteDate,
      },
    },
    async (tx) => {
      const contract = await tx.contract.create({
        data: {
          id,
          application_id: application.id,
          asset_id: application.assetId,
          signed_date: todayIso,
          signer_name: input.signerName,
          customer_type: application.customerType,
          customer_name:
            answers.q_company_name?.trim() || application.applicantName || input.signerName,
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
        },
      });
      // Take the item only if it is still available, in the same write: if someone else
      // signed for it a moment ago, nothing is updated and the whole signing rolls back.
      const taken = await tx.asset.updateMany({
        where: { id: application.assetId, status: 'available' },
        data: { status: 'reserved' },
      });
      if (taken.count === 0) throw new AssetTakenError();
      return contract;
    }
  ).catch((error: unknown) => {
    if (error instanceof AssetTakenError) return null;
    throw error;
  });
  if (!row) return { ok: false, reason: 'asset_not_available' };
  return { ok: true, contract: toContract(row) };
}
