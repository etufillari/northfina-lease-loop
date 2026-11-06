// Executes a fair early exit (Smart Problem 2, scenario card 8).
//
// The price is recalculated here from the contract terms with the same pure functions the
// invoices page uses (`earlyExitForContract`), so the browser never sends an amount that we
// then trust. The asset change and its audit row, which carries the whole breakdown, commit in
// one transaction.
import type { Asset, AssetCondition, AssetStatus } from '@/data/schemas';
import { calculateContractQuote } from '@/domain/contract-pricing';
import { earlyExitForContract } from '@/domain/early-exit';
import { effectiveAssetPriceOn } from '@/domain/price-list';
import { toAsset } from './assets';
import { withAudit } from './audit';
import type { PrismaClient } from './prisma-client';
import {
  readCoefficientTable,
  readPriceLists,
  readResidualCurves,
  readVatRates,
} from './reference-read';
import { percentToBp } from './reference-rows';

export type EarlyExitChoice = 'buyout' | 'return';

export type ExecuteEarlyExitInput = {
  assetId: string;
  choice: EarlyExitChoice;
  /** The signed contract, as the invoices page has it. */
  termMonths: number;
  downPaymentCents: number;
  signedOn: string;
  /** Leave on the due date of this rent row (1 = the first rent). */
  exitMonth: number;
  /** Condition the item is in at the exit. On a return it becomes the asset's condition. */
  condition: AssetCondition;
  actor: string;
};

export type EarlyExitReceipt = {
  choice: EarlyExitChoice;
  exitDate: string;
  remainingMonths: number;
  netCents: number;
  vatRatePercent: number;
  vatCents: number;
  grossCents: number;
};

export type ExecuteEarlyExitResult =
  | { ok: true; asset: Asset; receipt: EarlyExitReceipt }
  | { ok: false; reason: 'not_found' | 'lease_ended' | 'invalid_contract' };

/** A lease that was bought out or returned has already ended and cannot be exited again. */
const ENDED_STATUSES: readonly AssetStatus[] = ['sold', 'returned'];

class LeaseEndedError extends Error {}

export async function executeEarlyExit(
  db: PrismaClient,
  input: ExecuteEarlyExitInput
): Promise<ExecuteEarlyExitResult> {
  const row = await db.asset.findUnique({ where: { id: input.assetId } });
  if (!row) return { ok: false, reason: 'not_found' };
  const asset = toAsset(row);
  if (ENDED_STATUSES.includes(asset.status)) return { ok: false, reason: 'lease_ended' };

  const [priceLists, coefficientTable, residualCurves, vatRates] = await Promise.all([
    readPriceLists(db),
    readCoefficientTable(db),
    readResidualCurves(db),
    readVatRates(db),
  ]);

  const price = effectiveAssetPriceOn(priceLists, asset, input.signedOn);
  if (!price.ok) return { ok: false, reason: 'invalid_contract' };
  const quoted = calculateContractQuote({
    listPriceCents: price.priceCents,
    priceListVersion: price.priceListVersion,
    downPaymentCents: input.downPaymentCents,
    termMonths: input.termMonths,
    isoDate: input.signedOn,
    coefficientTable,
    vatRates,
  });
  if (!quoted.ok) return { ok: false, reason: 'invalid_contract' };

  const exit = earlyExitForContract({
    quote: quoted.quote,
    signedOn: input.signedOn,
    exitMonth: input.exitMonth,
    condition: input.condition,
    asset,
    residualCurves,
    vatRates,
  });
  const option = input.choice === 'buyout' ? exit.buyout : exit.returnItem;
  const nextStatus: AssetStatus = input.choice === 'buyout' ? 'sold' : 'returned';
  const receipt: EarlyExitReceipt = {
    choice: input.choice,
    exitDate: exit.asOf,
    remainingMonths: exit.remainingMonths,
    netCents: option.netCents,
    vatRatePercent: option.settlement.vatRatePercent,
    vatCents: option.settlement.vatCents,
    grossCents: option.settlement.grossCents,
  };

  try {
    const updated = await withAudit(
      db,
      {
        actor: input.actor,
        action: input.choice === 'buyout' ? 'lease.early_buyout' : 'lease.early_return',
        entityType: 'asset',
        entityId: asset.id,
        details: {
          from: asset.status,
          to: nextStatus,
          contract: {
            signedOn: input.signedOn,
            termMonths: input.termMonths,
            downPaymentCents: input.downPaymentCents,
            priceListVersion: quoted.quote.priceListVersion,
            monthlyNetRentCents: quoted.quote.monthlyNetRentCents,
            buyoutNetCents: quoted.quote.buyoutNetCents,
          },
          exitMonth: exit.billedMonths,
          condition: input.condition,
          balanceCents: exit.balanceCents,
          marketValueCents: exit.marketValue.valueCents,
          lines: option.lines.map(({ key, amountCents }) => ({ key, amountCents })),
          ...receipt,
        },
      },
      async (tx) => {
        // Re-check inside the transaction so two clicks cannot both end the same lease.
        const { count } = await tx.asset.updateMany({
          where: { id: asset.id, status: { notIn: [...ENDED_STATUSES] } },
          data:
            input.choice === 'return'
              ? {
                  status: nextStatus,
                  condition: input.condition,
                  previous_lives: { increment: 1 },
                }
              : { status: nextStatus },
        });
        if (count === 0) throw new LeaseEndedError();

        const activeContract = await tx.contract.findFirst({
          where: { asset_id: asset.id, status: 'active' },
          orderBy: { created_at: 'desc' },
          include: { invoiceRows: { orderBy: { seq: 'asc' } } },
        });

        if (activeContract) {
          await tx.contract.update({
            where: { id: activeContract.id },
            data: { status: 'exited', closed_on: exit.asOf },
          });
          await tx.invoiceRow.updateMany({
            where: {
              contract_id: activeContract.id,
              kind: 'rent',
              invoice_date: { gt: exit.asOf },
            },
            data: { cancelled_by_exit: true },
          });
          const nextSeq = (activeContract.invoiceRows.at(-1)?.seq ?? -1) + 1;
          await tx.invoiceRow.create({
            data: {
              contract_id: activeContract.id,
              seq: nextSeq,
              kind: input.choice === 'buyout' ? 'exit_buyout' : 'exit_return',
              invoice_date: exit.asOf,
              period_start: exit.asOf,
              period_end: exit.asOf,
              net_cents: option.netCents,
              vat_rate_bp: percentToBp(option.settlement.vatRatePercent),
              vat_cents: option.settlement.vatCents,
              gross_cents: option.settlement.grossCents,
            },
          });
        }

        await tx.assetEvent.create({
          data: {
            asset_id: asset.id,
            on_date: exit.asOf,
            from_status: asset.status,
            to_status: nextStatus,
            contract_id: activeContract?.id ?? null,
            condition: input.condition,
            usage_value: asset.usage.value,
            amount_cents: option.netCents,
            note_key:
              input.choice === 'buyout'
                ? 'passport.event.early_buyout'
                : 'passport.event.early_return',
          },
        });

        return tx.asset.findUniqueOrThrow({ where: { id: asset.id } });
      }
    );
    return { ok: true, asset: toAsset(updated), receipt };
  } catch (error) {
    if (error instanceof LeaseEndedError) return { ok: false, reason: 'lease_ended' };
    throw error;
  }
}
