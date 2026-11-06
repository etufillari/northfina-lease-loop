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
  contractInterestPercent,
  endEarly,
  type ContractRateResult,
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

export type ExitContextResult =
  { ok: true; context: ExitContext } | Extract<ContractRateResult, { ok: false }>;

/**
 * Everything the early-exit price needs besides the contract, with the rate from the table the
 * contract was signed on (D-045). The asset row still holds the item as delivered while it is leased.
 */
export function earlyExitContext(
  data: EarlyExitData,
  contract: Contract,
  asset: ExitAssetRow,
  clock: AgeClock
): ExitContextResult {
  const rate = contractInterestPercent(data.coefficientTable, contract);
  if (!rate.ok) return rate;
  const annualInterestPercent = rate.percent;
  const where = { table: 'asset', id: contract.assetId };
  const condition = parseStoredValue(assetConditionSchema, asset.condition, where);
  return {
    ok: true,
    context: {
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
    },
  };
}

/** Every reason `endLeaseEarly` refuses; `POST /api/contracts/:id/end-early` answers each. */
export type EndEarlyRefusal =
  | 'contract_not_found'
  /** Still waiting for the person who must sign (D-050). */
  | 'contract_not_active'
  | 'already_ended'
  | 'asset_not_leased'
  | Extract<ExitContextResult, { ok: false }>['reason']
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
  if (found.awaitingSignature) return { ok: false, reason: 'contract_not_active' };
  const { contract } = found;
  if (await db.contractEnding.findUnique({ where: { contract_id: input.contractId } })) {
    return { ok: false, reason: 'already_ended' };
  }
  const asset = await db.asset.findUnique({ where: { id: contract.assetId } });
  if (!asset || asset.status !== 'reserved') return { ok: false, reason: 'asset_not_leased' };
  const clock = await ageClockFor(db, contract.assetId);
  if (!clock) return { ok: false, reason: 'asset_not_leased' };
  const priced = earlyExitContext(data, contract, asset, clock);
  if (!priced.ok) return priced;
  const { context } = priced;

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
