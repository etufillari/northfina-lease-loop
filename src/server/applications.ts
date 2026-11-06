import { randomUUID } from 'node:crypto';
import type {
  Application as ApplicationRow,
  Contract as ContractRow,
  PrismaClient,
} from '@/generated/prisma/client';
import { loadCoefficientTable, loadCustomers, loadVatRates, loadQuestions } from '@/data/load';
import { resolveVat } from '@/domain/lease-engine/invoice';
import { prepareApplicationAnswers } from '@/domain/application-answers';
import { decideApplication } from '@/domain/application';
import { toLeaseDTO } from '@/server/lease-engine/contracts';
import { toLeaseTerms } from '@/domain/contract';
import { multiplyCents } from '@/domain/circular/money';
import { loadCataloguePriceLists } from '@/server/circular/prices';
import { monthlyRentFor } from '@/domain/monthly-rent';
import { listPriceOn } from '@/domain/price-list';
import { withAudit, type TransactionClient } from './audit';
import { toAsset } from './assets';

export const DEFAULT_PAYMENT_DUE_DAYS = 14;

export type SubmitApplicationInput = Readonly<{
  applicationId?: string;
  customerId: string;
  assetId: string;
  startDate: string;
  termMonths: 12 | 24 | 36 | 48;
  downPaymentCents: number;
  priceListVersion?: number;
  offerExpiresOn: string;
  actor: string;
  answers?: Record<string, string>;
}>;

export type SubmitApplicationResult =
  | { ok: true; application: ApplicationRow }
  | {
      ok: false;
      reason: 'customer_not_found' | 'asset_not_found' | 'asset_unavailable' | 'invalid_offer';
    };

export type SignContractInput = Readonly<{
  applicationId: string;
  contractId?: string;
  signerId: string;
  signedAt: Date;
  actor: string;
}>;

export type SignContractResult =
  | { ok: true; contract: ContractRow; terms: ReturnType<typeof toLeaseTerms> }
  | {
      ok: false;
      reason:
        | 'application_not_found'
        | 'not_approved'
        | 'signing_authority_required'
        | 'invalid_offer'
        | 'asset_unavailable'
        | 'already_signed';
    };

export function applicationResponse(row: ApplicationRow) {
  return {
    id: row.id,
    customerId: row.customer_id,
    assetId: row.asset_id,
    startDate: row.start_date,
    termMonths: row.term_months,
    monthlyNetCents: row.monthly_net_cents,
    paymentDueDays: row.payment_due_days,
    priceListVersion: row.price_list_version,
    offerExpiresOn: row.offer_expires_on,
    status: row.status,
    decisionReason: row.decision_reason,
    signingAuthority: row.signing_authority,
    submittedAt: row.submitted_at.toISOString(),
    signedAt: row.signed_at?.toISOString() ?? null,
  };
}

export function contractResponse(row: ContractRow) {
  return {
    id: row.id,
    applicationId: row.application_id,
    customerId: row.customer_id,
    assetId: row.asset_id,
    startDate: row.start_date,
    termMonths: row.term_months,
    monthlyNetCents: row.monthly_net_cents,
    paymentDueDays: row.payment_due_days,
    priceListVersion: row.price_list_version,
    signerId: row.signer_id,
    signedAt: row.signed_at.toISOString(),
    leaseTerms: toLeaseTerms({
      id: row.id,
      customerId: row.customer_id,
      assetId: row.asset_id,
      startDate: row.start_date,
      termMonths: row.term_months,
      monthlyNetCents: row.monthly_net_cents,
      paymentDueDays: row.payment_due_days,
    }),
  };
}

export async function submitApplication(
  db: PrismaClient,
  input: SubmitApplicationInput,
  now: Date
): Promise<SubmitApplicationResult> {
  const [customers, priceLists, coefficientTable, assetRow] = await Promise.all([
    loadCustomers(),
    loadCataloguePriceLists(db),
    loadCoefficientTable(),
    db.asset.findUnique({ where: { id: input.assetId } }),
  ]);
  if (!assetRow) return { ok: false, reason: 'asset_not_found' };
  const customer = customers.find((candidate) => candidate.id === input.customerId);
  if (!customer) return { ok: false, reason: 'customer_not_found' };
  const asset = toAsset({
    ...assetRow,
    status:
      assetRow.status === 'reserved' &&
      assetRow.reserved_until !== null &&
      assetRow.reserved_until <= now
        ? 'available'
        : assetRow.status,
  });
  const ownsReservation =
    assetRow.status === 'reserved' &&
    (assetRow.reserved_by === input.actor || assetRow.reserved_by === input.customerId) &&
    assetRow.reserved_until !== null &&
    assetRow.reserved_until > now;
  if (asset.status !== 'available' && !ownsReservation) {
    return { ok: false, reason: 'asset_unavailable' };
  }
  const decisionAsset = ownsReservation ? { ...asset, status: 'available' as const } : asset;
  if (input.offerExpiresOn < now.toISOString().slice(0, 10)) {
    return { ok: false, reason: 'invalid_offer' };
  }

  const price = listPriceOn(priceLists, input.assetId, input.startDate);
  if (
    !price.ok ||
    (input.priceListVersion !== undefined && price.priceListVersion !== input.priceListVersion)
  ) {
    return { ok: false, reason: 'invalid_offer' };
  }
  const monthlyRent = monthlyRentFor(
    coefficientTable,
    price.priceCents,
    input.downPaymentCents,
    input.termMonths
  );
  if (!monthlyRent.ok || monthlyRent.monthlyRentCents <= 0) {
    return { ok: false, reason: 'invalid_offer' };
  }
  const prepared = prepareApplicationAnswers(
    customer,
    (await loadQuestions()).questions,
    {
      customerType: customer.type,
      category: asset.category,
      financedCents: price.priceCents - input.downPaymentCents,
      termMonths: input.termMonths,
    },
    input.answers ?? {}
  );
  if (!prepared.ok) return { ok: false, reason: 'invalid_offer' };
  const vat = resolveVat((await loadVatRates()).rates, input.startDate);
  if (!vat.ok) return { ok: false, reason: 'invalid_offer' };
  const decision = decideApplication({
    customer: prepared.customer,
    asset: decisionAsset,
    monthlyNetCents: monthlyRent.monthlyRentCents,
    asOf: input.startDate,
    vatRateBps: vat.value.rateBps,
  });
  const applicationId = input.applicationId ?? randomUUID();
  const application = await withAudit(
    db,
    {
      actor: input.actor,
      action: 'application.submitted',
      entityType: 'application',
      entityId: applicationId,
      details: { status: decision.status, reason: decision.reason },
    },
    async (tx) =>
      tx.application.create({
        data: {
          id: applicationId,
          customer_id: input.customerId,
          asset_id: input.assetId,
          start_date: input.startDate,
          term_months: input.termMonths,
          monthly_net_cents: monthlyRent.monthlyRentCents,
          payment_due_days: DEFAULT_PAYMENT_DUE_DAYS,
          price_list_version: price.priceListVersion,
          offer_expires_on: input.offerExpiresOn,
          termination_policy: 'EXIT_CAP_BUYOUT_V1',
          down_payment_cents: input.downPaymentCents,
          financed_cents: price.priceCents - input.downPaymentCents,
          buyout_net_cents: multiplyCents(
            price.priceCents - input.downPaymentCents,
            (coefficientTable.end_of_term_buyout_percent_of_financed[String(input.termMonths)] ??
              0) / 100
          ),
          circular_offer_id:
            (
              await tx.circularOffer.findFirst({
                where: { assetId: input.assetId, publishedOn: { lte: input.startDate } },
                orderBy: [{ publishedOn: 'desc' }, { id: 'desc' }],
              })
            )?.id ?? null,
          status: decision.status,
          decision_reason: decision.reason,
          answers_json: JSON.stringify(prepared.answers),
          signing_authority: decision.signingAuthority,
        },
      })
  );
  return { ok: true, application };
}

class AssetUnavailableError extends Error {}

export async function signContract(
  db: PrismaClient,
  input: SignContractInput,
  afterSign?: (tx: TransactionClient, contract: ContractRow) => Promise<void>
): Promise<SignContractResult> {
  const application = await db.application.findUnique({ where: { id: input.applicationId } });
  if (!application) return { ok: false, reason: 'application_not_found' };
  if (application.status !== 'APPROVED') return { ok: false, reason: 'not_approved' };
  if (!application.signing_authority) return { ok: false, reason: 'signing_authority_required' };
  if (application.customer_id !== input.signerId) {
    return { ok: false, reason: 'signing_authority_required' };
  }
  if (application.signed_at) return { ok: false, reason: 'already_signed' };
  if (application.offer_expires_on < input.signedAt.toISOString().slice(0, 10)) {
    return { ok: false, reason: 'invalid_offer' };
  }

  const contractId = input.contractId ?? randomUUID();
  try {
    const contract = await withAudit(
      db,
      {
        actor: input.actor,
        action: 'contract.signed',
        entityType: 'contract',
        entityId: contractId,
        details: { applicationId: input.applicationId, signerId: input.signerId },
      },
      async (tx) => {
        const claimed = await tx.asset.updateMany({
          where: {
            id: application.asset_id,
            OR: [
              { status: 'available' },
              { status: 'reserved', reserved_until: { lte: input.signedAt } },
              { status: 'reserved', reserved_by: input.signerId },
            ],
          },
          data: { status: 'reserved', reserved_by: contractId, reserved_until: null },
        });
        if (claimed.count !== 1) throw new AssetUnavailableError();
        const created = await tx.contract.create({
          data: {
            id: contractId,
            application_id: application.id,
            customer_id: application.customer_id,
            asset_id: application.asset_id,
            start_date: application.start_date,
            term_months: application.term_months,
            monthly_net_cents: application.monthly_net_cents,
            payment_due_days: application.payment_due_days,
            price_list_version: application.price_list_version,
            termination_policy: application.termination_policy,
            down_payment_cents: application.down_payment_cents,
            financed_cents: application.financed_cents,
            buyout_net_cents: application.buyout_net_cents,
            circular_offer_id: application.circular_offer_id,
            signer_id: input.signerId,
            signed_at: input.signedAt,
          },
        });
        await tx.application.update({
          where: { id: application.id },
          data: { signed_at: input.signedAt },
        });
        if (afterSign) await afterSign(tx, created);
        return created;
      }
    );
    return {
      ok: true,
      contract,
      terms: toLeaseTerms({
        id: contract.id,
        customerId: contract.customer_id,
        assetId: contract.asset_id,
        startDate: contract.start_date,
        termMonths: contract.term_months,
        monthlyNetCents: contract.monthly_net_cents,
        paymentDueDays: contract.payment_due_days,
      }),
    };
  } catch (error) {
    if (error instanceof AssetUnavailableError) return { ok: false, reason: 'asset_unavailable' };
    if (isUniqueConstraintError(error)) return { ok: false, reason: 'already_signed' };
    throw error;
  }
}

function isUniqueConstraintError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002';
}

export async function getApplication(db: PrismaClient, id: string) {
  return db.application.findUnique({ where: { id } });
}

export async function getContract(db: PrismaClient, id: string) {
  return db.contract.findUnique({ where: { id } });
}

export async function listContractsForCustomer(db: PrismaClient, customerId: string) {
  const contracts = await db.contract.findMany({
    where: { customer_id: customerId },
    orderBy: { signed_at: 'desc' },
  });
  const leases = await db.engineLease.findMany({ where: { customerId } });
  return contracts.map((contract) => {
    const engine = leases.find((lease) => lease.contractId === contract.id);
    return {
      signedDate: contract.signed_at.toISOString().slice(0, 10),
      leaseId: engine?.id ?? null,
      status: engine ? toLeaseDTO(engine).status : ('SIGNED' as const),
      latestInvoicePaid: false,
      terms: toLeaseTerms({
        id: contract.id,
        customerId: contract.customer_id,
        assetId: contract.asset_id,
        startDate: contract.start_date,
        termMonths: contract.term_months,
        monthlyNetCents: contract.monthly_net_cents,
        paymentDueDays: contract.payment_due_days,
      }),
    };
  });
}
