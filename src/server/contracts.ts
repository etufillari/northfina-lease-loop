// Signing and reading contracts. `signContract` reads the application, the quote and the asset
// through their owners' read functions, plans the contract with the pure `planContract`, and
// writes it in one `withAudit` transaction: the asset is taken with a conditional write (the
// last-unit race), the contract row is created and CONTRACT_SIGNED is emitted, so the invoices
// and the passport commit or roll back with it.
import { randomUUID } from 'node:crypto';
import { Prisma, type Contract as ContractRow } from '@/generated/prisma/client';
import {
  planContract,
  priceLockOf,
  type PlannedContract,
  type PriceLock,
  type SignRefusal,
} from '@/domain/contracts';
import { priceQuote, type PricingData, type QuoteStatus } from '@/domain/pricing';
import { contractRowSchema } from '@/domain/rows/contract';
import { contractStatusSchema, type ContractStatus } from '@/domain/statuses';
import type { AuthzRefusal } from '@/domain/authz/policy';
import { getApplication } from './applications';
import { getAsset } from './assets';
import { getCustomer } from './customers';
import { withAudit, type TransactionClient } from './audit';
import { authorize } from './authorize';
import { AssetNotAvailableError, leaseAvailableAsset } from './catalogue-handlers';
import { emit } from './events';
import './event-handlers';
import type { PrismaClient } from './prisma-client';
import { parseRow } from './row-rules';
import { pricingForAsset } from './second-life-price';
import { getQuote, loadPricingData, storedQuoteStatusOn, type StoredQuote } from './quotes';

export type ContractView = Omit<PlannedContract, 'status'> & {
  status: ContractStatus;
  endedOn: string | null;
};

/** The contract, its quote day and, when today's list is another version, why the price holds. */
export type ContractDetails = {
  contract: ContractView;
  quoteDate: string;
  priceLock: PriceLock | null;
};

export type SignContractInput = {
  applicationId: string;
  /** The business start day; the signing day when left out. */
  startDate?: string;
  actor: string;
};

export type SignContractRefusal =
  | SignRefusal
  | { code: 'application_not_found'; params: { applicationId: string } }
  | AuthzRefusal
  | { code: 'already_signed'; params: { applicationId: string } }
  | { code: 'quote_reserved_for_another_customer'; params: { quoteId: string } };

/** Thrown inside the signing transaction when the application is no longer approved (D87). */
class ApplicationMovedOn extends Error {
  constructor(readonly decision: string) {
    super(`application is ${decision}`);
  }
}

export type SignContractResult =
  { ok: true; details: ContractDetails } | { ok: false; reason: SignContractRefusal };

export function toContractView(row: ContractRow): ContractView {
  return {
    id: row.id,
    number: row.number,
    applicationId: row.application_id,
    customerId: row.customer_id,
    assetId: row.asset_id,
    quantity: row.quantity,
    signedOn: row.signed_on,
    startDate: row.start_date,
    endDate: row.end_date,
    termMonths: row.term_months,
    unitListPriceCents: row.list_price_cents,
    downPaymentCents: row.down_payment_cents,
    financedCents: row.financed_cents,
    band: row.band,
    factorMillionths: row.factor_millionths,
    monthlyNetCents: row.monthly_net_cents,
    buyoutCents: row.buyout_cents,
    vatRateBasisPoints: row.vat_rate_bp_at_signing,
    priceListVersion: row.price_list_version,
    status: contractStatusSchema.parse(row.status),
    endedOn: row.ended_on,
  };
}

/** What the stored quote would cost on `today`'s list, when that list is another version. */
function repricedMonthlyNet(
  stored: StoredQuote,
  status: QuoteStatus,
  today: string,
  data: PricingData
): number | null {
  const { breakdown } = stored;
  if (status.todayList === null || status.todayList.version === breakdown.priceListVersion) {
    return null;
  }
  const repriced = priceQuote(data, {
    assetId: breakdown.assetId,
    termMonths: breakdown.termMonths,
    downPaymentCents: breakdown.downPaymentCents,
    isoDate: today,
  });
  return repriced.ok ? repriced.quote.monthlyNetCents : null;
}

/** Why the contract keeps the quote's price on `today` (card 2), or null when nothing changed. */
function priceLockOn(stored: StoredQuote, today: string, data: PricingData): PriceLock | null {
  const quoteStatus = storedQuoteStatusOn(stored, today, data.priceLists);
  return priceLockOf({
    quote: { ...stored.breakdown, isoDate: stored.quoteDate },
    quoteStatus,
    currentMonthlyNetCents: repricedMonthlyNet(stored, quoteStatus, today, data),
  });
}

/** P2002 on the unique `application_id`: the same application was signed first. */
function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

/**
 * Signs `applicationId` on `today` (the request's day, demo clock included). Authorized first
 * (D73): the application's customer or `admin`, never a case waiting for the company's
 * signatory. Never re-prices: the contract copies the quote.
 */
export async function signContract(
  db: PrismaClient,
  input: SignContractInput,
  today: string,
  data?: PricingData
): Promise<SignContractResult> {
  const { applicationId } = input;
  const notFound = {
    ok: false,
    reason: { code: 'application_not_found', params: { applicationId } },
  } as const;
  const auth = await authorize(db, input.actor, 'sign_contract', { application: applicationId });
  if (!auth.ok)
    return auth.reason.code === 'not_found' ? notFound : { ok: false, reason: auth.reason };
  const application = await getApplication(db, applicationId);
  if (!application) return notFound;
  const alreadySigned = {
    ok: false,
    reason: { code: 'already_signed', params: { applicationId } },
  } as const;
  if (await db.contract.findUnique({ where: { application_id: applicationId } })) {
    return alreadySigned;
  }

  const stored = await getQuote(db, application.quoteId);
  if (!stored) throw new Error(`Application ${applicationId} names a missing quote`);
  // D90: a pass-on's quote is held for the customer it named; only their application signs it.
  if (stored.customerId !== null && stored.customerId !== application.customerId) {
    return {
      ok: false,
      reason: { code: 'quote_reserved_for_another_customer', params: { quoteId: stored.id } },
    };
  }
  const asset = await getAsset(db, stored.breakdown.assetId);
  if (!asset) throw new Error(`Quote ${stored.id} names a missing asset`);
  // D90: the item a pass-on reserved for this quote's customer counts as available to them.
  const heldForSigner = stored.customerId !== null;
  const assetStatus = heldForSigner && asset.status === 'reserved' ? 'available' : asset.status;
  // D12: a relisted item's quote was priced on its second-life amount; the price lock compares
  // with the same amount (src/server/second-life-price.ts).
  const pricing = await pricingForAsset(db, asset.id, data ?? (await loadPricingData()));
  // D16: an item with an ended earlier lease starts its next life on a chained contract.
  const previous = await db.contract.findFirst({
    where: { asset_id: asset.id, status: { not: 'active' } },
    orderBy: [{ signed_on: 'desc' }, { number: 'desc' }],
    select: { id: true },
  });
  const quoteStatus = storedQuoteStatusOn(stored, today, pricing.priceLists);
  const customer = await getCustomer(db, application.customerId);

  const plan = planContract({
    contractId: randomUUID(),
    applicationId,
    customerId: application.customerId,
    decision: application.decision,
    assetStatus,
    quote: { ...stored.breakdown, isoDate: stored.quoteDate, validUntil: stored.validUntil },
    quoteStatus,
    currentMonthlyNetCents: repricedMonthlyNet(stored, quoteStatus, today, pricing),
    signedOn: today,
    startDate: input.startDate ?? today,
    birthDate: customer && 'birth_date' in customer ? customer.birth_date : undefined,
  });
  if (!plan.ok) return plan;
  const { contract, event } = plan;

  try {
    const row = await withAudit(
      db,
      {
        actor: input.actor,
        action: 'contract.signed',
        entityType: 'contract',
        entityId: contract.id,
        details: {
          number: contract.number,
          applicationId,
          assetId: contract.assetId,
          quantity: contract.quantity,
          signedOn: contract.signedOn,
          startDate: contract.startDate,
          monthlyNetCents: contract.monthlyNetCents,
          priceListVersion: contract.priceListVersion,
        },
      },
      async (tx) => {
        // D87: the applicant may have withdrawn it since it was read; re-read in this
        // transaction so a withdrawal and a signing at the same instant leave one winner.
        const still = await getApplication(tx, applicationId);
        if (still?.decision !== 'approved') throw new ApplicationMovedOn(still?.decision ?? '');
        // D90: a quote held for its named customer leases the item reserved for them; the
        // application could only be made by that customer (applications.ts).
        await leaseAvailableAsset(tx, contract.assetId, heldForSigner);
        // The row's own rules (D27): the frozen price, the term's last day, the status.
        const created = await tx.contract.create({
          data: parseRow('contract', contractRowSchema, {
            ...toContractRowData(contract),
            previous_contract_id: previous?.id ?? null,
          }),
        });
        await emit(tx, event);
        return created;
      }
    );
    return {
      ok: true,
      details: {
        contract: toContractView(row),
        quoteDate: stored.quoteDate,
        priceLock: plan.priceLock,
      },
    };
  } catch (error) {
    if (error instanceof AssetNotAvailableError) {
      const now = await getAsset(db, contract.assetId);
      return {
        ok: false,
        reason: { code: 'asset_not_available', params: { status: now?.status ?? 'unknown' } },
      };
    }
    if (isUniqueViolation(error)) return alreadySigned;
    if (error instanceof ApplicationMovedOn) {
      return {
        ok: false,
        reason: { code: 'application_not_approved', params: { decision: error.decision } },
      };
    }
    throw error;
  }
}

function toContractRowData(contract: PlannedContract) {
  return {
    id: contract.id,
    number: contract.number,
    application_id: contract.applicationId,
    customer_id: contract.customerId,
    asset_id: contract.assetId,
    quantity: contract.quantity,
    signed_on: contract.signedOn,
    start_date: contract.startDate,
    end_date: contract.endDate,
    term_months: contract.termMonths,
    list_price_cents: contract.unitListPriceCents,
    down_payment_cents: contract.downPaymentCents,
    financed_cents: contract.financedCents,
    band: contract.band,
    factor_millionths: contract.factorMillionths,
    monthly_net_cents: contract.monthlyNetCents,
    buyout_cents: contract.buyoutCents,
    vat_rate_bp_at_signing: contract.vatRateBasisPoints,
    price_list_version: contract.priceListVersion,
    status: contractStatusSchema.parse(contract.status),
  };
}

/** One contract by id, or null. The owner's read other slices use (team rule 3). */
export async function getContract(
  db: PrismaClient | TransactionClient,
  id: string
): Promise<ContractView | null> {
  const row = await db.contract.findUnique({ where: { id } });
  return row ? toContractView(row) : null;
}

/**
 * The contracts of one customer (`{ customerId }`) or, without it, every contract (admin),
 * newest signing first and then by number. For the My leases page.
 */
export async function listContracts(
  db: PrismaClient,
  filter: { customerId?: string }
): Promise<ContractView[]> {
  const rows = await db.contract.findMany({
    where: filter.customerId ? { customer_id: filter.customerId } : {},
    orderBy: [{ signed_on: 'desc' }, { number: 'desc' }],
  });
  return rows.map(toContractView);
}

/** The customer of a contract, for the access checks. Null for an unknown contract. */
export async function contractCustomerId(
  db: PrismaClient | TransactionClient,
  id: string
): Promise<string | null> {
  const row = await db.contract.findUnique({ where: { id }, select: { customer_id: true } });
  return row?.customer_id ?? null;
}

/** The id of the contract signed from `applicationId`, or null while it is unsigned. */
export async function contractIdOfApplication(
  db: PrismaClient | TransactionClient,
  applicationId: string
): Promise<string | null> {
  const row = await db.contract.findUnique({
    where: { application_id: applicationId },
    select: { id: true },
  });
  return row?.id ?? null;
}

/** One contract with its quote day and price-lock explanation on `today`, or null. */
export async function getContractDetails(
  db: PrismaClient,
  id: string,
  today: string,
  data?: PricingData
): Promise<ContractDetails | null> {
  const row = await db.contract.findUnique({ where: { id } });
  if (!row) return null;
  const application = await getApplication(db, row.application_id);
  const stored = application ? await getQuote(db, application.quoteId) : null;
  if (!stored) throw new Error(`Contract ${id} has no stored quote`);
  const pricing = data ?? (await loadPricingData());
  return {
    contract: toContractView(row),
    quoteDate: stored.quoteDate,
    priceLock: priceLockOn(stored, today, pricing),
  };
}

/**
 * The contract slice's operation for the end of a lease (kickoff brief section 6: the end of
 * term and the early exit change the status "through the contract's operation"). Runs on the
 * caller's `tx`, inside the exit's `withAudit`. The row as it will be is parsed with
 * `contractRowSchema` first (D27: an ended status has an end day, never before the start),
 * then written only while the contract is still `active`. Returns null when it is not (a
 * second exit, or a race lost), so the caller rolls back.
 */
export async function endContract(
  tx: TransactionClient,
  input: { id: string; status: ContractStatus; endedOn: string }
): Promise<ContractView | null> {
  const current = await tx.contract.findUnique({ where: { id: input.id } });
  if (!current) return null;
  const { created_at: _created, updated_at: _updated, ...stored } = current;
  const next = parseRow('contract', contractRowSchema, {
    ...stored,
    status: input.status,
    ended_on: input.endedOn,
  });
  const { count } = await tx.contract.updateMany({
    where: { id: input.id, status: contractStatusSchema.parse('active') },
    data: { status: next.status, ended_on: next.ended_on },
  });
  if (count !== 1) return null;
  return toContractView(await tx.contract.findUniqueOrThrow({ where: { id: input.id } }));
}

/**
 * The contracts of one asset, oldest signing first: the second life reads the first one (the
 * price and day of the first lease, D60) and the latest (the lease it came back from).
 */
export async function listAssetContracts(
  db: PrismaClient | TransactionClient,
  assetId: string
): Promise<ContractView[]> {
  const rows = await db.contract.findMany({
    where: { asset_id: assetId },
    orderBy: [{ signed_on: 'asc' }, { number: 'asc' }],
  });
  return rows.map(toContractView);
}
