// Signing a lease and reading contracts back. The server always prices from scratch: numbers
// sent by the browser are never trusted. Signing and its audit row commit together.
import { z } from 'zod';
import type { AssetCategory } from '@/data/schemas';
import { signContract, type Contract } from '@/domain/contract';
import { decideApplication } from '@/domain/eligibility';
import { invoiceSchedule } from '@/domain/invoicing';
import type { Answers } from '@/domain/question-flow';
import { makeQuote } from '@/domain/quote';
import { withAudit } from './audit';
import type { LeaseDataPack } from './lease-data';
import type { PrismaClient } from './prisma-client';

export type { LeaseDataPack } from './lease-data';

export interface SignLeaseInput {
  assetId: string;
  /** A data-pack persona; a new applicant is named by the email they gave. */
  customerId?: string;
  /** The application answers; the server decides them again before signing. */
  answers: Answers;
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
  if (input.customerId !== undefined && !data.customers.some((c) => c.id === input.customerId)) {
    return { ok: false, reason: 'unknown_customer' };
  }

  const quoted = makeQuote(data.priceLists, data.coefficientTable, {
    assetId: input.assetId,
    quoteDate: input.today,
    termMonths: input.termMonths,
    downPaymentCents: input.downPaymentCents,
  });
  if (!quoted.ok) return quoted;
  const refusal = applicationRefusal(data, input, asset.category, quoted.quote);
  if (refusal) return { ok: false, reason: refusal };

  const signed = signContract(quoted.quote, {
    customerId: input.customerId ?? `email:${String(input.answers.q_email)}`,
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

/**
 * Decides the application on the server with the deal being signed, so a stale or tampered
 * answer from the browser can't sign. Affordability uses the highest monthly total over the
 * term (D-023). Returns why it can't be signed, or null when it can.
 */
function applicationRefusal(
  data: LeaseDataPack,
  input: SignLeaseInput,
  category: string,
  quote: { financedCents: number; monthlyNetRentCents: number }
): string | null {
  const schedule = invoiceSchedule(
    {
      startDate: input.today,
      termMonths: input.termMonths,
      monthlyNetRentCents: quote.monthlyNetRentCents,
      billing: 'start_day_full_months',
    },
    data.vatRates
  );
  if (!schedule.ok) return 'no_vat_rate';
  const decision = decideApplication(data.questions, {
    deal: {
      category: category as AssetCategory,
      financedAmountCents: quote.financedCents,
      termMonths: input.termMonths,
    },
    answers: input.answers,
    startDate: input.today,
    highestMonthlyGrossCents: Math.max(...schedule.invoices.map((i) => i.grossCents)),
  });
  if (decision.status !== 'decided') return `application_${decision.status}`;
  if (decision.outcome === 'declined') return 'application_declined';
  if (decision.outcome === 'manual_review') return 'application_needs_review';
  if (decision.signer.kind === 'signatory') return 'signatory_must_sign';
  return null;
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
