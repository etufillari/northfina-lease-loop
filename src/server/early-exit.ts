// Leaving a lease early (D-033): price it with the domain, then record it like an end-of-term
// choice (one ContractEnding row, the asset change and the audit row in one transaction).
import {
  assetCategorySchema,
  assetConditionSchema,
  type CoefficientTable,
  type ResidualCurves,
  type VatRates,
} from '@/data/schemas';
import type { Contract } from '@/domain/contract';
import { itemAgeOn, type AgeClock } from '@/domain/item-age';
import {
  bandInterestPercent,
  endEarly,
  type EarlyExitChoice,
  type EndEarlyResult,
  type ExitContext,
} from '@/domain/early-exit';
import { getContract } from './contracts';
import { recordEnding, type EndLeaseResult } from './contract-endings';
import { ageClockFor } from './item-age';
import type { PrismaClient } from './prisma-client';
import { parseStoredValue } from './stored-row';

export interface EarlyExitData {
  vatRates: VatRates;
  curves: ResidualCurves;
  coefficientTable: CoefficientTable;
}

/** The asset columns the valuation needs. */
export interface ExitAssetRow {
  category: string;
  model_year: number;
  condition: string;
  usage_value: number;
}

/**
 * Everything the early-exit price needs besides the contract, or null when the contract's band is
 * missing from the table. The asset row still holds the item as delivered while it is leased.
 */
export function earlyExitContext(
  data: EarlyExitData,
  contract: Contract,
  asset: ExitAssetRow,
  clock: AgeClock
): ExitContext | null {
  const annualInterestPercent = bandInterestPercent(data.coefficientTable, contract.band);
  if (annualInterestPercent === null) return null;
  const where = { table: 'asset', id: contract.assetId };
  const condition = parseStoredValue(assetConditionSchema, asset.condition, where);
  return {
    vatRates: data.vatRates,
    curves: data.curves,
    annualInterestPercent,
    item: {
      category: parseStoredValue(assetCategorySchema, asset.category, where),
      // The same age rule as second life and the passport (D-042).
      ageAtStartMonths: itemAgeOn(clock, contract.startDate),
      condition,
      usageValue: asset.usage_value,
    },
  };
}

/** Every reason `endLeaseEarly` refuses; `POST /api/contracts/:id/end-early` answers each. */
export type EndEarlyRefusal =
  | 'contract_not_found'
  | 'already_ended'
  | 'asset_not_leased'
  | 'unknown_band'
  | Extract<EndEarlyResult, { ok: false }>['reason'];

export interface EndEarlyInput {
  contractId: number;
  choice: EarlyExitChoice;
  today: string;
  actor: string;
}

export async function endLeaseEarly(
  db: PrismaClient,
  data: EarlyExitData,
  input: EndEarlyInput
): Promise<EndLeaseResult<EndEarlyRefusal>> {
  const found = await getContract(db, input.contractId);
  if (!found) return { ok: false, reason: 'contract_not_found' };
  const { contract } = found;
  if (await db.contractEnding.findUnique({ where: { contract_id: input.contractId } })) {
    return { ok: false, reason: 'already_ended' };
  }
  const asset = await db.asset.findUnique({ where: { id: contract.assetId } });
  if (!asset || asset.status !== 'reserved') return { ok: false, reason: 'asset_not_leased' };
  const clock = await ageClockFor(db, contract.assetId);
  if (!clock) return { ok: false, reason: 'asset_not_leased' };
  const context = earlyExitContext(data, contract, asset, clock);
  if (!context) return { ok: false, reason: 'unknown_band' };

  const decided = endEarly(
    contract,
    context,
    { condition: context.item.condition, usageValue: context.item.usageValue },
    input.choice,
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
