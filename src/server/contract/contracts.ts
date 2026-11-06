// Signing and reading contracts. Signing is one transaction: the asset becomes leased, and the
// contract, its invoices and a new life are created, or none of it happens.
import { randomUUID } from 'node:crypto';
import {
  contractSchema,
  type Application,
  type Contract,
  type Invoice,
} from '@/data/lease-schemas';
import { loadCoefficientTable, loadPriceLists, loadVatRates } from '@/data/load';
import type { Customer } from '@/data/schemas';
import {
  buildContract,
  listPriceOnSigning,
  lockedQuote,
  openLife,
  signingProblem,
} from '@/domain/contract/contract';
import { isHeldForSomeoneElse } from '@/domain/assets/status';
import { choiceDeadline, endChoice, type EndChoice } from '@/domain/end-of-term/end-of-term';
import { invoiceSchedule, invoiceTotals, type InvoiceTotals } from '@/domain/invoicing/invoicing';
import {
  upcomingVatChange,
  withVatChanges,
  type UpcomingVatChange,
  type VatChange,
} from '@/domain/invoicing/vat-change';
import type { Contract as ContractRow, PrismaClient } from '@/generated/prisma/client';
import { getApplication } from '../application/applications';
import { toAsset } from '../assets/assets';
import { withAudit } from '../audit';
import { currentDate } from '../date/app-date';
import { toInvoice } from '../invoicing/invoices';

export function toContract(row: ContractRow): Contract {
  return contractSchema.parse({
    id: row.id,
    application_id: row.application_id,
    customer_id: row.customer_id,
    asset_id: row.asset_id,
    quote_date: row.quote_date,
    signed_on: row.signed_on,
    signed_by: row.signed_by,
    start_on: row.start_on,
    planned_end_on: row.planned_end_on,
    actual_end_on: row.actual_end_on,
    passed_to: row.passed_to,
    status: row.status,
    price_list_version: row.price_list_version,
    base_price_cents: row.base_price_cents,
    down_payment_cents: row.down_payment_cents,
    financed_cents: row.financed_cents,
    term_months: row.term_months,
    band: row.band,
    factor_micros: row.factor_micros,
    annual_interest_basis_points: row.annual_interest_basis_points,
    monthly_net_rent_cents: row.monthly_net_rent_cents,
    buyout_cents: row.buyout_cents,
  });
}

/**
 * A contract as the screens see it. The list price on the signing date is looked up when read.
 * `end_choice` and `choice_deadline` tell a screen when to offer the end-of-term choice.
 * The totals add up the contract's invoices, so they include VAT at each invoice's own rate.
 */
export type ContractView = Contract &
  InvoiceTotals & {
    list_price_on_signing_cents: number | null;
    end_choice: EndChoice;
    choice_deadline: string;
  };

export async function contractViews(
  db: PrismaClient,
  contracts: readonly Contract[]
): Promise<ContractView[]> {
  const [priceLists, today, invoiceRows] = await Promise.all([
    loadPriceLists(),
    currentDate(db),
    db.invoice.findMany({ where: { contract_id: { in: contracts.map(({ id }) => id) } } }),
  ]);
  const invoices = invoiceRows.map(toInvoice);

  return contracts.map((contract) => ({
    ...contract,
    ...invoiceTotals(invoices.filter((invoice) => invoice.contract_id === contract.id)),
    list_price_on_signing_cents: listPriceOnSigning(contract, priceLists),
    end_choice: endChoice(contract, today),
    choice_deadline: choiceDeadline(contract),
  }));
}

export async function getContract(db: PrismaClient, id: string): Promise<Contract | null> {
  const row = await db.contract.findUnique({ where: { id } });
  return row ? toContract(row) : null;
}

export async function listContracts(
  db: PrismaClient,
  filter: { customerId?: string } = {}
): Promise<Contract[]> {
  const rows = await db.contract.findMany({
    where: { customer_id: filter.customerId },
    orderBy: [{ created_at: 'asc' }, { id: 'asc' }],
  });
  return rows.map(toContract);
}

/** The contract an approved application becomes today, and its invoices. Saves nothing. */
async function draftContract(
  db: PrismaClient,
  application: Application,
  id: string,
  signedBy: string
) {
  const locked = lockedQuote(await loadCoefficientTable(), application);
  if (!locked.ok) {
    throw new Error(`approved application ${application.id} cannot be priced: ${locked.reason}`);
  }

  const contract: Contract = {
    id,
    ...buildContract(application, locked.quote, await currentDate(db)),
    signed_by: signedBy,
    passed_to: null,
  };
  return { contract, invoices: invoiceSchedule(contract, await loadVatRates()) };
}

function signatoryEmail(application: Application): string | null {
  const email = application.answers.q_signatory_email;
  return typeof email === 'string' ? email : null;
}

export type ContractPreview = Omit<
  Contract,
  'id' | 'status' | 'actual_end_on' | 'signed_by' | 'passed_to'
> &
  InvoiceTotals & {
    /** What the customer is leasing, in words. */
    asset_name: string;
    /** The dates assume signing on this day. Signing later moves them. */
    calculated_on: string;
    /** Set when a VAT change falls within the lease, to warn the customer before they sign. */
    upcoming_vat_change: UpcomingVatChange | null;
    list_price_on_signing_cents: number | null;
    /** `false` for a company applicant who may read the terms but not sign. */
    can_sign: boolean;
    signatory_email: string | null;
    invoices: (Omit<Invoice, 'id' | 'contract_id'> & {
      vat_rate_percent: number;
      vat_change: VatChange | null;
    })[];
  };

export type ContractPreviewResult =
  | { ok: true; preview: ContractPreview }
  | {
      ok: false;
      reason: 'application_not_found' | 'not_approved' | 'already_signed' | 'asset_not_available';
    };

/** Exactly what signing today would create, so the customer can read it first. Saves nothing. */
export async function previewContract(
  db: PrismaClient,
  input: { applicationId: string; customer: Customer; signatoryId?: string }
): Promise<ContractPreviewResult> {
  const { applicationId, customer, signatoryId } = input;

  const application = await getApplication(db, applicationId);
  if (!application) return { ok: false, reason: 'application_not_found' };

  const problem = signingProblem(application, customer, signatoryId !== undefined);
  if (problem === 'not_owner') return { ok: false, reason: 'application_not_found' };
  if (problem === 'not_approved') return { ok: false, reason: 'not_approved' };

  const existing = await db.contract.findUnique({
    where: { application_id: applicationId },
    select: { id: true },
  });
  if (existing) return { ok: false, reason: 'already_signed' };

  const asset = await db.asset.findUniqueOrThrow({
    where: { id: application.asset_id },
    select: { status: true, reserved_for: true, make: true, model: true },
  });
  if (asset.status !== 'available' || isHeldForSomeoneElse(asset.reserved_for, customer.id)) {
    return { ok: false, reason: 'asset_not_available' };
  }

  const { contract, invoices } = await draftContract(
    db,
    application,
    'preview',
    signatoryId ?? customer.id
  );
  const {
    id: _id,
    status: _status,
    actual_end_on: _end,
    signed_by: _by,
    passed_to: _to,
    ...terms
  } = contract;

  return {
    ok: true,
    preview: {
      ...terms,
      ...invoiceTotals(invoices),
      asset_name: `${asset.make} ${asset.model}`,
      calculated_on: contract.signed_on,
      upcoming_vat_change: upcomingVatChange(await loadVatRates(), {
        startOn: contract.start_on,
        termMonths: contract.term_months,
        monthlyNetRentCents: contract.monthly_net_rent_cents,
      }),
      list_price_on_signing_cents: listPriceOnSigning(contract, await loadPriceLists()),
      can_sign: problem === null,
      signatory_email: signatoryEmail(application),
      invoices: withVatChanges(invoices).map(({ contract_id: _contract, ...invoice }) => ({
        ...invoice,
        vat_rate_percent: invoice.vat_rate_basis_points / 100,
      })),
    },
  };
}

export type SignResult =
  | { ok: true; contract: ContractView }
  | { ok: false; reason: 'application_not_found' | 'not_approved' | 'already_signed' }
  | { ok: false; reason: 'asset_not_available' }
  | { ok: false; reason: 'signatory_required'; signatory_email: string | null };

class AssetNotAvailable extends Error {}

/**
 * Signs an approved application. The quote always wins: the price comes from the application,
 * and the signing date only sets the contract's dates. The asset moves from available to
 * leased inside the transaction, so two signings cannot lease the same item.
 */
export async function signContract(
  db: PrismaClient,
  input: { applicationId: string; customer: Customer; signatoryId?: string }
): Promise<SignResult> {
  const { applicationId, customer, signatoryId } = input;
  const signer = signatoryId ?? customer.id;

  const application = await getApplication(db, applicationId);
  if (!application) return { ok: false, reason: 'application_not_found' };

  const problem = signingProblem(application, customer, signatoryId !== undefined);
  if (problem === 'not_owner') return { ok: false, reason: 'application_not_found' };
  if (problem === 'not_approved') return { ok: false, reason: 'not_approved' };
  if (problem === 'signatory_required') {
    return {
      ok: false,
      reason: 'signatory_required',
      signatory_email: signatoryEmail(application),
    };
  }

  const existing = await db.contract.findUnique({
    where: { application_id: applicationId },
    select: { id: true },
  });
  if (existing) return { ok: false, reason: 'already_signed' };

  const id = `con-${randomUUID()}`;
  const { contract, invoices } = await draftContract(db, application, id, signer);

  const assetRow = await db.asset.findUniqueOrThrow({ where: { id: contract.asset_id } });
  const latestLife = await db.assetLife.findFirst({
    where: { asset_id: contract.asset_id },
    orderBy: { life_number: 'desc' },
    select: { life_number: true, first_lease_price_cents: true },
  });
  const life = openLife(contract, toAsset(assetRow), latestLife);

  try {
    await withAudit(
      db,
      {
        actor: signer,
        action: 'contract.signed',
        entityType: 'contract',
        entityId: id,
        details: {
          application_id: applicationId,
          customer_id: customer.id,
          asset_id: contract.asset_id,
          price_list_version: contract.price_list_version,
          monthly_net_rent_cents: contract.monthly_net_rent_cents,
          signed_on: contract.signed_on,
          start_on: contract.start_on,
          asset_status: { from: 'available', to: 'leased' },
          life_number: life.life_number,
          invoice_count: invoices.length,
        },
      },
      async (tx) => {
        const taken = await tx.asset.updateMany({
          where: {
            id: contract.asset_id,
            status: 'available',
            OR: [{ reserved_for: null }, { reserved_for: customer.id }],
          },
          data: { status: 'leased', reserved_for: null },
        });
        if (taken.count === 0) throw new AssetNotAvailable();

        await tx.contract.create({ data: contract });
        await tx.invoice.createMany({ data: invoices });
        await tx.assetLife.create({ data: life });
      }
    );
  } catch (error) {
    if (error instanceof AssetNotAvailable) return { ok: false, reason: 'asset_not_available' };
    throw error;
  }

  const [view] = await contractViews(db, [contract]);
  if (!view) throw new Error('a contract view is always returned for a contract');
  return { ok: true, contract: view };
}
