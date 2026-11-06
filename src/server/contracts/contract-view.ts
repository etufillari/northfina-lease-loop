import type {
  Contract as ContractRow,
  Invoice as InvoiceRow,
  Payment as PaymentRow,
  Prisma,
} from '@/generated/prisma/client';
import { loadVatRates } from '@/data/load';
import {
  contractStatusSchema,
  endOfTermActionSchema,
  type Asset,
  type ContractStatus,
  type Customer,
  type EndOfTermAction,
  type InvoiceStatus,
} from '@/data/schemas';
import { invoiceScheduleFor, type InvoiceScheduleContract } from '@/domain/invoicing/invoicing';
import type { QuoteData } from '@/domain/pricing/quote';
import { toCustomer } from '../assets/customers';
import { toAsset } from '../assets/assets';
import type { PrismaClient } from '../prisma-client';
import { toInvoiceRecord, type InvoiceWithPayments } from '../invoicing/invoice-record';
import { endOfTermAvailabilityFor, type EndOfTermAvailability } from '../lifecycle/end-of-term';

type ContractWithRelations = Prisma.ContractGetPayload<{
  include: {
    application: { include: { customer: true } };
    asset: true;
    invoices: { orderBy: { sequence: 'asc' }; include: { payments: true } };
  };
}>;

export type ContractViewInvoice = {
  id: string | null;
  sequence: number;
  status: InvoiceStatus | 'scheduled';
  paymentStatus: 'unpaid' | 'partially_paid' | 'paid' | null;
  isOverdue: boolean;
  totalPaidCents: number;
  remainingCents: number;
  periodStart: string;
  periodEnd: string;
  dueOn: string;
  netRentCents: number;
  vatRateBasisPoints: number;
  vatCents: number;
  totalCents: number;
  issuedAt: string | null;
  paidAt: string | null;
};

export type ContractViewActivity = {
  id: string;
  kind: 'contract' | 'asset';
  action: string;
  eventType: string | null;
  occurredOn: string;
  actor: string | null;
};

export type CustomerContractView = {
  contract: {
    id: string;
    status: ContractStatus;
    signedOn: string | null;
    startsOn: string;
    endsOn: string;
    termMonths: number;
    downPaymentCents: number;
    listPriceCents: number;
    financedAmountCents: number;
    priceListVersion: number;
    coefficientBand: string;
    coefficientFactorPpm: number;
    monthlyNetRentCents: number;
    buyoutCents: number;
    endOfTermAction: EndOfTermAction | null;
    buyoutPaidCents: number | null;
    pricingSnapshot: QuoteData;
  };
  customer: Customer;
  asset: Asset;
  invoices: ContractViewInvoice[];
  activity: ContractViewActivity[];
  endOfTerm: EndOfTermAvailability;
  passedOnTo: ContractViewPassOn | null;
};

export type ContractViewPassOn = {
  recipient: string;
  monthlyNetRentCents: number;
  termMonths: number;
  marketValueCents: number;
};

export type ContractViewResult = CustomerContractView | null;

function pricingSnapshotFor(row: ContractRow): QuoteData {
  if (row.pricing_snapshot_json === null) {
    throw new Error(`Contract ${row.id} is missing its pricing snapshot`);
  }
  try {
    return JSON.parse(row.pricing_snapshot_json) as QuoteData;
  } catch {
    throw new Error(`Contract ${row.id} has invalid pricing snapshot JSON`);
  }
}

function persistedInvoiceFor(
  row: InvoiceRow & { payments: PaymentRow[] },
  asOf: string
): ContractViewInvoice {
  const invoice = toInvoiceRecord(row as InvoiceWithPayments, asOf);
  return {
    id: invoice.id,
    sequence: invoice.sequence,
    status: invoice.status,
    paymentStatus: invoice.paymentStatus,
    isOverdue: invoice.isOverdue,
    totalPaidCents: invoice.totalPaidCents,
    remainingCents: invoice.remainingCents,
    periodStart: invoice.periodStart,
    periodEnd: invoice.periodEnd,
    dueOn: invoice.dueOn,
    netRentCents: invoice.netRentCents,
    vatRateBasisPoints: invoice.vatRateBasisPoints,
    vatCents: invoice.vatCents,
    totalCents: invoice.totalCents,
    issuedAt: invoice.issuedAt,
    paidAt: invoice.paidAt,
  };
}

function scheduledInvoiceFor(invoice: {
  sequence: number;
  periodStart: string;
  periodEnd: string;
  dueOn: string;
  netRentCents: number;
  vatRateBasisPoints: number;
  vatCents: number;
  totalCents: number;
}): ContractViewInvoice {
  return {
    id: null,
    sequence: invoice.sequence,
    status: 'scheduled',
    paymentStatus: null,
    isOverdue: false,
    totalPaidCents: 0,
    remainingCents: invoice.totalCents,
    periodStart: invoice.periodStart,
    periodEnd: invoice.periodEnd,
    dueOn: invoice.dueOn,
    netRentCents: invoice.netRentCents,
    vatRateBasisPoints: invoice.vatRateBasisPoints,
    vatCents: invoice.vatCents,
    totalCents: invoice.totalCents,
    issuedAt: null,
    paidAt: null,
  };
}

async function invoicesFor(
  row: ContractWithRelations,
  asOf: string
): Promise<ContractViewInvoice[]> {
  if (row.invoices.length > 0) {
    return row.invoices.map((invoice) => persistedInvoiceFor(invoice, asOf));
  }

  const scheduleInput: InvoiceScheduleContract = {
    startsOn: row.starts_on,
    endsOn: row.ends_on,
    termMonths: row.term_months,
    monthlyNetRentCents: row.monthly_net_rent_cents,
  };
  const schedule = invoiceScheduleFor(scheduleInput, await loadVatRates());
  if (!schedule.ok) return [];
  return schedule.invoices.map(scheduledInvoiceFor);
}

async function activityFor(
  db: PrismaClient,
  row: ContractWithRelations
): Promise<ContractViewActivity[]> {
  // The passport follows the item, so this reads every life, not only this contract.
  const history = await db.assetHistory.findMany({
    where: { asset_id: row.asset_id },
    orderBy: [{ occurred_on: 'desc' }, { id: 'desc' }],
  });
  const audits = await db.auditLog.findMany({
    where: { entity_type: 'contract', entity_id: row.id },
    orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
  });
  const activities: ContractViewActivity[] = audits.map((audit) => ({
    id: `audit-${audit.id}`,
    kind: 'contract',
    action: audit.action,
    eventType: null,
    occurredOn: audit.created_at.toISOString(),
    actor: audit.actor,
  }));

  activities.push(
    ...history.map((entry) => ({
      id: `history-${entry.id}`,
      kind: 'asset' as const,
      action: 'asset.history',
      eventType: entry.event_type,
      occurredOn: entry.occurred_on,
      // Other lives may belong to someone else, so their customer stays private.
      actor: entry.contract_id === row.id ? entry.actor : null,
    }))
  );

  return activities.sort(
    (left, right) =>
      right.occurredOn.localeCompare(left.occurredOn) || right.id.localeCompare(left.id)
  );
}

async function passedOnToFor(
  db: PrismaClient,
  contractId: string
): Promise<ContractViewPassOn | null> {
  const match = await db.secondLifeMatch.findUnique({ where: { from_contract_id: contractId } });
  if (!match) return null;
  const request = JSON.parse(match.request_snapshot_json) as { who?: string };
  return {
    recipient: match.recipient_name ?? request.who ?? '',
    monthlyNetRentCents: match.monthly_net_rent_cents,
    termMonths: match.term_months,
    marketValueCents: match.market_value_cents,
  };
}

/** Builds the read-only customer contract screen without changing invoice state. */
export async function getCustomerContract(
  db: PrismaClient,
  contractId: string,
  asOf: string
): Promise<ContractViewResult> {
  const row = await db.contract.findUnique({
    where: { id: contractId },
    include: {
      application: { include: { customer: true } },
      asset: true,
      invoices: { orderBy: { sequence: 'asc' }, include: { payments: true } },
    },
  });
  if (!row) return null;

  const status = contractStatusSchema.parse(row.status);
  return {
    contract: {
      id: row.id,
      status,
      signedOn: row.signed_on,
      startsOn: row.starts_on,
      endsOn: row.ends_on,
      termMonths: row.term_months,
      downPaymentCents: row.down_payment_cents,
      listPriceCents: row.list_price_cents,
      financedAmountCents: row.financed_amount_cents,
      priceListVersion: row.price_list_version,
      coefficientBand: row.coefficient_band,
      coefficientFactorPpm: row.coefficient_factor_ppm,
      monthlyNetRentCents: row.monthly_net_rent_cents,
      buyoutCents: row.buyout_cents,
      endOfTermAction: row.end_of_term_action
        ? endOfTermActionSchema.parse(row.end_of_term_action)
        : null,
      buyoutPaidCents: row.buyout_paid_cents,
      pricingSnapshot: pricingSnapshotFor(row),
    },
    customer: toCustomer(row.application.customer),
    asset: toAsset(row.asset),
    invoices: await invoicesFor(row, asOf),
    activity: await activityFor(db, row),
    endOfTerm: endOfTermAvailabilityFor(row, asOf),
    passedOnTo: await passedOnToFor(db, row.id),
  };
}
