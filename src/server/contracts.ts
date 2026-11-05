// Signing a lease and reading contracts back. The server always prices from scratch: numbers
// sent by the browser are never trusted. Signing and its audit row commit together.
import { z } from 'zod';
import { signContract, type Contract } from '@/domain/contract';
import { makeQuote } from '@/domain/quote';
import { withAudit } from './audit';
import type { LeaseDataPack } from './lease-data';
import type { PrismaClient } from './prisma-client';

export type { LeaseDataPack } from './lease-data';

export interface SignLeaseInput {
  assetId: string;
  customerId: string;
  termMonths: number;
  downPaymentCents: number;
  /** Quote, signing and start date for an on-the-spot lease (ISO). */
  today: string;
  actor: string;
}

export type SignLeaseResult =
  { ok: true; id: number; contract: Contract } | { ok: false; reason: string };

/** Thrown inside the transaction to roll it back when the asset was taken meanwhile. */
class AssetTakenError extends Error {}

export async function signLease(
  db: PrismaClient,
  data: LeaseDataPack,
  input: SignLeaseInput
): Promise<SignLeaseResult> {
  const asset = await db.asset.findUnique({ where: { id: input.assetId } });
  if (!asset) return { ok: false, reason: 'asset_not_found' };
  if (asset.status !== 'available') return { ok: false, reason: 'asset_not_available' };
  if (!data.customers.some((c) => c.id === input.customerId)) {
    return { ok: false, reason: 'unknown_customer' };
  }

  const quoted = makeQuote(data.priceLists, data.coefficientTable, {
    assetId: input.assetId,
    quoteDate: input.today,
    termMonths: input.termMonths,
    downPaymentCents: input.downPaymentCents,
  });
  if (!quoted.ok) return quoted;
  const signed = signContract(quoted.quote, {
    customerId: input.customerId,
    signDate: input.today,
    startDate: input.today,
  });
  if (!signed.ok) return signed;
  const { contract } = signed;

  try {
    const row = await withAudit(
      db,
      (created: { id: number }) => ({
        actor: input.actor,
        action: 'contract.signed',
        entityType: 'contract',
        entityId: String(created.id),
        details: {
          assetId: contract.assetId,
          customerId: contract.customerId,
          monthlyNetRentCents: contract.monthlyNetRentCents,
          priceListVersion: contract.priceListVersion,
        },
      }),
      async (tx) => {
        // Only flips an asset that is still available, so two signings can't both win.
        const reserved = await tx.asset.updateMany({
          where: { id: contract.assetId, status: 'available' },
          data: { status: 'reserved' },
        });
        if (reserved.count !== 1) throw new AssetTakenError();
        return tx.contract.create({
          data: {
            asset_id: contract.assetId,
            customer_id: contract.customerId,
            sign_date: contract.signDate,
            start_date: contract.startDate,
            terms_json: JSON.stringify(contract),
          },
        });
      }
    );
    return { ok: true, id: row.id, contract };
  } catch (error) {
    if (error instanceof AssetTakenError) return { ok: false, reason: 'asset_not_available' };
    throw error;
  }
}

/** Mirrors the domain `Contract` type, so a hand-edited row is caught when read. */
const contractSchema = z.strictObject({
  assetId: z.string(),
  customerId: z.string(),
  quoteDate: z.iso.date(),
  signDate: z.iso.date(),
  startDate: z.iso.date(),
  termMonths: z.number().int().positive(),
  downPaymentCents: z.number().int().nonnegative(),
  priceListVersion: z.number().int().positive(),
  coefficientTableId: z.string(),
  listPriceCents: z.number().int().positive(),
  financedCents: z.number().int().positive(),
  band: z.string(),
  factor: z.number().positive(),
  monthlyNetRentCents: z.number().int().positive(),
  buyoutCents: z.number().int().nonnegative(),
  totalNetRentCents: z.number().int().positive(),
  totalNetCostCents: z.number().int().positive(),
  billing: z.literal('start_day_full_months'),
}) satisfies z.ZodType<Contract>;

export async function getContract(
  db: PrismaClient,
  id: number
): Promise<{ id: number; contract: Contract } | null> {
  const row = await db.contract.findUnique({ where: { id } });
  if (!row) return null;
  return { id: row.id, contract: Object.freeze(contractSchema.parse(JSON.parse(row.terms_json))) };
}
