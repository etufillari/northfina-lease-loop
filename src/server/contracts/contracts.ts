import { randomUUID } from 'node:crypto';
import type { Contract as ContractRow } from '@/generated/prisma/client';
import { contractStatusSchema, isoDateSchema } from '@/data/schemas';
import { contractDatesFor } from '@/domain/contracts/contract';
import type { QuoteData } from '@/domain/pricing/quote';
import { z } from 'zod';
import { withAudit } from '../audit';
import type { PrismaClient } from '../prisma-client';

export const contractCreationRequestSchema = z.strictObject({
  applicationId: z.string().min(1),
  signedOn: isoDateSchema,
  actor: z.string().trim().min(1).max(100),
});

export type ContractCreationRequest = z.infer<typeof contractCreationRequestSchema>;

export type ContractCreationFailure =
  | { ok: false; reason: 'application_not_found' }
  | { ok: false; reason: 'application_not_approved'; status: string }
  | { ok: false; reason: 'contract_already_exists'; contractId: string }
  | { ok: false; reason: 'asset_unavailable'; status: string };

export type CreatedContract = {
  id: string;
  applicationId: string;
  assetId: string;
  status: 'active';
  signedOn: string;
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
  pricingSnapshot: QuoteData;
};

export type ContractCreationResult =
  { ok: true; contract: CreatedContract } | ContractCreationFailure;

class AssetReservationFailed extends Error {
  constructor(readonly status: string) {
    super('The asset was no longer available during contract creation');
    this.name = 'AssetReservationFailed';
  }
}

function requiredApplicationValue<T>(value: T | null, field: string): T {
  if (value === null) throw new Error(`Approved application is missing ${field}`);
  return value;
}

function parsePricingSnapshot(json: string): QuoteData {
  try {
    return JSON.parse(json) as QuoteData;
  } catch {
    throw new Error('Approved application has invalid pricing snapshot JSON');
  }
}

function toCreatedContract(row: ContractRow): CreatedContract {
  const status = contractStatusSchema.parse(row.status);
  if (status !== 'active' || row.signed_on === null || row.pricing_snapshot_json === null) {
    throw new Error(`Contract ${row.id} is missing its active signing snapshot`);
  }

  return {
    id: row.id,
    applicationId: row.application_id,
    assetId: row.asset_id,
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
    pricingSnapshot: JSON.parse(row.pricing_snapshot_json) as QuoteData,
  };
}

/** Signs an approved application and locks its existing net pricing snapshot. */
export async function createContract(
  db: PrismaClient,
  input: ContractCreationRequest
): Promise<ContractCreationResult> {
  const application = await db.application.findUnique({
    where: { id: input.applicationId },
    include: { asset: true, contract: true },
  });
  if (!application) return { ok: false, reason: 'application_not_found' };
  if (application.status !== 'approved') {
    return { ok: false, reason: 'application_not_approved', status: application.status };
  }
  if (application.contract) {
    return {
      ok: false,
      reason: 'contract_already_exists',
      contractId: application.contract.id,
    };
  }
  if (application.asset.status !== 'available') {
    return { ok: false, reason: 'asset_unavailable', status: application.asset.status };
  }

  const pricingSnapshot = parsePricingSnapshot(
    requiredApplicationValue(application.pricing_snapshot_json, 'pricing snapshot')
  );
  const { pricing } = pricingSnapshot;
  const startsOn = application.start_date;
  const dates = contractDatesFor(startsOn, pricing.termMonths);
  const rowData = {
    application_id: application.id,
    asset_id: application.asset_id,
    status: 'active',
    signed_on: input.signedOn,
    starts_on: dates.startsOn,
    ends_on: dates.endsOn,
    term_months: pricing.termMonths,
    down_payment_cents: pricing.downPaymentCents,
    list_price_cents: pricing.netListPriceCents,
    financed_amount_cents: pricing.financedCents,
    price_list_version: pricingSnapshot.sources.priceListVersion,
    coefficient_band: pricing.coefficientBand,
    coefficient_factor_ppm: Math.round(pricing.monthlyFactor * 1_000_000),
    annual_interest_basis_points: pricing.annualInterestBasisPoints,
    monthly_net_rent_cents: pricing.monthlyNetRentCents,
    buyout_cents: pricing.endOfTermBuyoutCents,
    pricing_snapshot_json: JSON.stringify(pricingSnapshot),
  };

  const contractId = randomUUID();
  try {
    const row = await withAudit(
      db,
      {
        actor: input.actor,
        action: 'contract.signed',
        entityType: 'contract',
        entityId: contractId,
        details: {
          applicationId: application.id,
          assetId: application.asset_id,
          priceListVersion: rowData.price_list_version,
          assetStatus: { from: 'available', to: 'reserved' },
        },
      },
      async (tx) => {
        const created = await tx.contract.create({ data: { id: contractId, ...rowData } });
        const reserved = await tx.asset.updateMany({
          where: { id: application.asset_id, status: 'available' },
          data: {
            status: 'reserved',
            first_leased_on: application.asset.first_leased_on ?? dates.startsOn,
            original_list_price_cents:
              application.asset.original_list_price_cents ?? pricing.netListPriceCents,
          },
        });
        if (reserved.count !== 1) {
          const current = await tx.asset.findUnique({ where: { id: application.asset_id } });
          throw new AssetReservationFailed(current?.status ?? 'missing');
        }
        await tx.assetHistory.create({
          data: {
            asset_id: application.asset_id,
            contract_id: contractId,
            event_type: 'lease_started',
            occurred_on: dates.startsOn,
            from_status: 'available',
            to_status: 'reserved',
            actor: input.actor,
          },
        });
        return created;
      }
    );

    return { ok: true, contract: toCreatedContract(row) };
  } catch (error) {
    if (error instanceof AssetReservationFailed) {
      return { ok: false, reason: 'asset_unavailable', status: error.status };
    }
    throw error;
  }
}
