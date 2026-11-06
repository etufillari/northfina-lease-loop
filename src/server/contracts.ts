// Signing and reading contracts. Signing is one transaction: reserve the asset, store the
// snapshot, issue the invoices already due, write the audit row. All of it or none of it.
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Contract as ContractRow } from '@/generated/prisma/client';
import {
  lockContract,
  type AcceptedPrice,
  type ContractSnapshot,
  type PriceLock,
} from '@/domain/contract';
import { buildInvoiceSchedule, invoicesDueBy } from '@/domain/invoicing';
import { withAudit } from './audit';
import { refusal, type PricingData } from './pricing-data';
import type { PrismaClient } from './prisma-client';
import { toInvoiceRowData } from './invoices';
import { toAssetQuote, toBreakdown } from './quotes';

export type Contract = ContractSnapshot & { id: string; quoteId: string; status: string };

const priceLockSchema: z.ZodType<PriceLock> = z.strictObject({
  reason: z.enum(['price_unchanged_since_quote', 'list_price_changed_since_quote']),
  quotedOn: z.string(),
  signedOn: z.string(),
  quotedPriceListVersion: z.number().nullable(),
  lockedPriceListVersion: z.number().nullable(),
  quotedListPriceCents: z.number(),
  lockedListPriceCents: z.number(),
  quotedMonthlyNetRentCents: z.number(),
  lockedMonthlyNetRentCents: z.number(),
});

export function toContract(row: ContractRow): Contract {
  return {
    ...toBreakdown(row),
    id: row.id,
    quoteId: row.quote_id,
    status: row.status,
    assetId: row.asset_id,
    customerId: row.customer_id,
    signedOn: row.signed_on,
    startDate: row.start_date,
    endDate: row.end_date,
    priceListVersion: row.price_list_version,
    priceLock: priceLockSchema.parse(JSON.parse(row.price_lock_json)),
  };
}

export type SignContractRequest = {
  quoteId: string;
  customerId: string;
  signedOn: string;
  startDate: string;
  accepted: AcceptedPrice;
  actor: string;
};

/**
 * Applies the price-lock rule and signs. If the price moved, throws 409 PRICE_CHANGED with the
 * new figures in `details.repriced`; sign again with those as `accepted` once they are agreed.
 */
export async function signContract(
  db: PrismaClient,
  data: PricingData,
  request: SignContractRequest
): Promise<Contract> {
  const quoteRow = await db.quote.findUnique({ where: { id: request.quoteId } });
  if (!quoteRow) throw refusal('quote_not_found');

  const locked = lockContract({
    quote: toAssetQuote(quoteRow),
    customerId: request.customerId,
    signedOn: request.signedOn,
    startDate: request.startDate,
    accepted: request.accepted,
    priceLists: data.priceLists,
    table: data.table,
  });
  if (!locked.ok) {
    throw refusal(
      locked.reason,
      locked.reason === 'price_changed' ? { repriced: locked.repriced } : undefined
    );
  }

  const { snapshot } = locked;
  const schedule = buildInvoiceSchedule(snapshot, data.vatRates);
  if (!schedule.ok) throw refusal(schedule.reason, { date: schedule.date });

  const id = randomUUID();
  const row = await withAudit(
    db,
    {
      actor: request.actor,
      action: 'contract.signed',
      entityType: 'contract',
      entityId: id,
      details: {
        quoteId: request.quoteId,
        assetId: snapshot.assetId,
        monthlyNetRentCents: snapshot.monthlyNetRentCents,
        priceLock: snapshot.priceLock,
      },
    },
    async (tx) => {
      if (await tx.contract.findUnique({ where: { quote_id: request.quoteId } })) {
        throw refusal('quote_already_signed');
      }
      // Conditional update: of two people signing at once, exactly one gets the asset.
      const reserved = await tx.asset.updateMany({
        where: { id: snapshot.assetId, status: 'available' },
        data: { status: 'reserved' },
      });
      if (reserved.count !== 1) throw refusal('asset_unavailable');

      const contract = await tx.contract.create({
        data: {
          id,
          quote_id: request.quoteId,
          asset_id: snapshot.assetId,
          customer_id: snapshot.customerId,
          status: 'active',
          signed_on: snapshot.signedOn,
          start_date: snapshot.startDate,
          end_date: snapshot.endDate,
          price_list_version: snapshot.priceListVersion,
          list_price_cents: snapshot.listPriceCents,
          down_payment_cents: snapshot.downPaymentCents,
          term_months: snapshot.termMonths,
          financed_cents: snapshot.financedCents,
          band: snapshot.band,
          monthly_factor: snapshot.monthlyFactor,
          annual_interest_percent: snapshot.annualInterestPercent,
          monthly_net_rent_cents: snapshot.monthlyNetRentCents,
          buyout_percent: snapshot.buyoutPercent,
          buyout_net_cents: snapshot.buyoutNetCents,
          contract_net_total_cents: snapshot.contractNetTotalCents,
          price_lock_json: JSON.stringify(snapshot.priceLock),
        },
      });
      await tx.invoice.createMany({
        data: invoicesDueBy(schedule.invoices, snapshot.signedOn).map((line) =>
          toInvoiceRowData(id, line)
        ),
      });
      return contract;
    }
  );
  return toContract(row);
}

export async function getContract(db: PrismaClient, id: string): Promise<Contract> {
  const row = await db.contract.findUnique({ where: { id } });
  if (!row) throw refusal('contract_not_found');
  return toContract(row);
}

/** Contracts, filtered by asset, or by the last day of the lease for the dealer dashboard. */
export async function listContracts(
  db: PrismaClient,
  filter: { assetId?: string; endingFrom?: string; endingTo?: string } = {}
): Promise<Contract[]> {
  const rows = await db.contract.findMany({
    where: {
      ...(filter.assetId ? { asset_id: filter.assetId } : {}),
      end_date: { gte: filter.endingFrom, lte: filter.endingTo },
    },
    orderBy: [{ end_date: 'asc' }, { id: 'asc' }],
  });
  return rows.map(toContract);
}
