// How a lease ends: at the end of term (Spine step 6, D-029) or early (D-033). The contract row
// stays frozen; the ending is its own row, written with the asset change and the audit row in one
// transaction.
import { z } from 'zod';
import { assetConditionSchema, type Customer, type VatRates } from '@/data/schemas';
import { endOfTerm, type EndOfTermChoice, type Ending } from '@/domain/end-of-term';
import { withAudit } from './audit';
import { getContract } from './contracts';
import type { PrismaClient } from './prisma-client';
import { parseStoredJson, parseStoredValue } from './stored-row';

export interface EndLeaseInput {
  contractId: number;
  choice: EndOfTermChoice;
  today: string;
  actor: string;
}

export type EndLeaseResult =
  { ok: true; ending: Ending } | { ok: false; reason: string; opensOn?: string };

/** Thrown inside the transaction to roll it back when the asset changed meanwhile. */
class AssetChangedError extends Error {}

export async function endLease(
  db: PrismaClient,
  data: { vatRates: VatRates; customers: Customer[] },
  input: EndLeaseInput
): Promise<EndLeaseResult> {
  const found = await getContract(db, input.contractId);
  if (!found) return { ok: false, reason: 'contract_not_found' };
  const { contract } = found;
  if (await db.contractEnding.findUnique({ where: { contract_id: input.contractId } })) {
    return { ok: false, reason: 'already_ended' };
  }
  const { choice } = input;
  if (
    choice.kind === 'pass_on' &&
    choice.nextLessee.startsWith('cust-') &&
    !data.customers.some((c) => c.id === choice.nextLessee)
  ) {
    return { ok: false, reason: 'unknown_customer' };
  }
  const asset = await db.asset.findUnique({ where: { id: contract.assetId } });
  if (!asset || asset.status !== 'reserved') return { ok: false, reason: 'asset_not_leased' };

  const decided = endOfTerm(
    contract,
    data.vatRates,
    {
      condition: parseStoredValue(assetConditionSchema, asset.condition, {
        table: 'asset',
        id: asset.id,
      }),
      usageValue: asset.usage_value,
    },
    choice,
    input.today
  );
  if (!decided.ok) return decided;
  return recordEnding(
    db,
    { contractId: input.contractId, assetId: contract.assetId, asOf: input.today },
    decided.ending,
    input.actor
  );
}

/**
 * Writes an ending (end of term or early, D-029/D-033) with the asset change and its audit row
 * in one transaction. The asset update only matches a leased item, so a race rolls it all back.
 */
export async function recordEnding(
  db: PrismaClient,
  target: { contractId: number; assetId: string; asOf: string },
  ending: Ending,
  actor: string
): Promise<EndLeaseResult> {
  const sold = ending.kind === 'buy' || ending.kind === 'early_buy';
  try {
    await withAudit(
      db,
      {
        actor,
        action: `contract.ended_${ending.kind}`,
        entityType: 'contract',
        entityId: String(target.contractId),
        details: { assetId: target.assetId, ...ending, asOf: target.asOf }, // D-030
      },
      async (tx) => {
        // A finished lease is a finished life, whichever way it ends.
        const changed = await tx.asset.updateMany({
          where: { id: target.assetId, status: 'reserved' },
          data: {
            status: sold ? 'sold' : 'returned',
            previous_lives: { increment: 1 },
            ...(ending.inspection
              ? {
                  condition: ending.inspection.condition,
                  usage_value: ending.inspection.usageValue,
                }
              : {}),
          },
        });
        if (changed.count !== 1) throw new AssetChangedError();
        return tx.contractEnding.create({
          data: {
            contract_id: target.contractId,
            kind: ending.kind,
            decided_on: ending.decidedOn,
            effective_date: ending.effectiveDate,
            ending_json: JSON.stringify(ending),
          },
        });
      }
    );
  } catch (error) {
    if (error instanceof AssetChangedError) return { ok: false, reason: 'asset_not_leased' };
    throw error;
  }
  return { ok: true, ending };
}

const cents = z.number().int();
const exitPriceSchema = z.strictObject({
  netCents: cents,
  vatCents: cents,
  grossCents: cents,
  discountCents: cents,
});
const earlyExitQuoteSchema = z.strictObject({
  exitMonth: z.number().int().positive(),
  effectiveDate: z.iso.date(),
  monthsLeft: z.number().int().nonnegative(),
  annualInterestPercent: z.number().min(0),
  vatRatePercent: z.number().min(0),
  remainingRentsCents: cents,
  remainingRentsPvCents: cents,
  buyoutCents: cents,
  buyoutPvCents: cents,
  valueNowCents: cents,
  valueAtEndCents: cents,
  endAmountCents: cents,
  endAmountPvCents: cents,
  buy: exitPriceSchema,
  handBack: exitPriceSchema,
});

const inspectionSchema = z.strictObject({
  condition: assetConditionSchema,
  usageValue: z.number().int().nonnegative(),
});

/** Mirrors the domain `Ending`, so a hand-edited row is caught when read. */
const endingSchema = z.strictObject({
  kind: z.enum(['buy', 'return', 'pass_on', 'early_buy', 'early_hand_back']),
  decidedOn: z.iso.date(),
  effectiveDate: z.iso.date(),
  buyoutInvoice: z
    .strictObject({
      invoiceDate: z.iso.date(),
      vatRatePercent: z.number().min(0),
      netCents: z.number().int(),
      vatCents: z.number().int(),
      grossCents: z.number().int(),
    })
    .optional(),
  inspection: inspectionSchema.optional(),
  nextLessee: z.string().optional(),
  earlyExit: earlyExitQuoteSchema.optional(),
}) satisfies z.ZodType<Ending>;

export async function getContractEnding(
  db: PrismaClient,
  contractId: number
): Promise<Ending | null> {
  const row = await db.contractEnding.findUnique({ where: { contract_id: contractId } });
  if (!row) return null;
  return parseStoredJson(endingSchema, row.ending_json, {
    table: 'contract ending',
    id: contractId,
  });
}
