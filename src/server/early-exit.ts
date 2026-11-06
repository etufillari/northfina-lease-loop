// Early exit on the server (see src/domain/early-exit.ts for the formula). Ending a lease
// before its last day: buy the item now, or return it now for the exit fee. Demo payments.
import { loadCoefficientTable, loadResidualCurves } from '@/data/load';
import type { PrismaClient } from '@/generated/prisma/client';
import { monthlyFactorFor } from '@/domain/coefficient';
import { contractStage } from '@/domain/contract';
import { earlyExitQuote, type EarlyExitQuote } from '@/domain/early-exit';
import { ageInMonths, marketValueCents } from '@/domain/second-life';
import { vatPercentOn } from '@/domain/vat';
import { assetOn, hasLaterHistory } from './asset-state';
import { withAudit } from './audit';
import { getContract, type Contract } from './contracts';
import { contractInvoices } from './invoices';
import { originalListPrice } from './second-life';
import { effectiveVatRates } from './vat';

export type EarlyExitInfo =
  | { ok: true; quote: EarlyExitQuote; unpaidCount: number; unpaidCents: number }
  | { ok: false; reason: 'not_running' | 'cannot_price' };

/** The early-exit quote for a running contract on `today`, and what must be paid first. */
export async function earlyExitFor(
  db: PrismaClient,
  contract: Contract,
  today: string
): Promise<EarlyExitInfo> {
  if (contract.status !== 'active' || contractStage(contract, today) !== 'active') {
    return { ok: false, reason: 'not_running' };
  }
  const [table, curves, vatRates, item, original, invoices] = await Promise.all([
    loadCoefficientTable(),
    loadResidualCurves(),
    effectiveVatRates(db),
    assetOn(db, contract.assetId, today),
    originalListPrice(contract.assetId),
    contractInvoices(db, contract, today),
  ]);
  const factor = monthlyFactorFor(table, contract.financedCents, contract.termMonths);
  const vatPercent = vatPercentOn(vatRates, today);
  if (!factor.ok || vatPercent === null || !item || original === null || !invoices) {
    return { ok: false, reason: 'cannot_price' };
  }
  const asset = item.asset;
  const marketValue = marketValueCents(
    {
      originalNetCents: item.secondLifePriceCents ?? original,
      category: asset.category,
      ageMonths: ageInMonths(asset.model_year, today),
      condition: asset.condition,
      usage: asset.usage.value,
    },
    curves
  );
  const unpaid = invoices.filter((invoice) => invoice.status === 'due');
  return {
    ok: true,
    quote: earlyExitQuote({
      startDate: contract.startDate,
      termMonths: contract.termMonths,
      monthlyNetCents: contract.monthlyNetCents,
      buyoutCents: contract.buyoutCents,
      annualInterestPercent: factor.band.annual_interest_percent,
      invoicesIssued: invoices.filter((invoice) => invoice.status !== 'upcoming').length,
      marketValueCents: marketValue,
      vatPercent,
      today,
    }),
    unpaidCount: unpaid.length,
    unpaidCents: unpaid.reduce((sum, invoice) => sum + invoice.totalCents, 0),
  };
}

export type ExitEarlyResult =
  | { ok: true; paidCents: number }
  | {
      ok: false;
      reason: 'not_found' | 'not_running' | 'cannot_price' | 'unpaid_invoices' | 'later_history';
    };

/**
 * Ends a running lease today. "buy": the customer pays what is still owed and keeps the item
 * (contract bought, item sold). "return": the customer pays the exit fee and the item comes
 * back for its next life. Either way invoices after today are cancelled, and the change and an
 * `contract.exited_early` audit row are written in one transaction.
 */
export async function exitEarly(
  db: PrismaClient,
  input: { contractId: string; choice: 'buy' | 'return'; actor: string },
  todayIso: string
): Promise<ExitEarlyResult> {
  const contract = await getContract(db, input.contractId);
  if (!contract) return { ok: false, reason: 'not_found' };
  if (await hasLaterHistory(db, contract.assetId, todayIso)) {
    return { ok: false, reason: 'later_history' };
  }
  const info = await earlyExitFor(db, contract, todayIso);
  if (!info.ok) return info;
  if (info.unpaidCount > 0) return { ok: false, reason: 'unpaid_invoices' };
  const buying = input.choice === 'buy';
  const amount = buying ? info.quote.buy : info.quote.return;

  await withAudit(
    db,
    {
      actor: input.actor,
      action: 'contract.exited_early',
      entityType: 'contract',
      entityId: contract.id,
      details: {
        assetId: contract.assetId,
        choice: input.choice,
        remainingMonths: info.quote.remainingMonths,
        stillOwedCents: info.quote.stillOwedCents,
        marketValueCents: info.quote.marketValueCents,
        paidCents: amount.totalCents,
        coolingOff: info.quote.coolingOff,
        demo: true,
      },
    },
    async (tx) => {
      await tx.asset.update({
        where: { id: contract.assetId },
        data: { status: buying ? 'sold' : 'returned', previous_lives: { increment: 1 } },
      });
      await tx.contract.update({
        where: { id: contract.id },
        data: buying
          ? {
              status: 'bought',
              bought_date: todayIso,
              buyout_paid_cents: amount.totalCents,
              exited_early_date: todayIso,
            }
          : {
              status: 'returned',
              returned_date: todayIso,
              exited_early_date: todayIso,
              exit_fee_cents: amount.totalCents,
            },
      });
    }
  );
  return { ok: true, paidCents: amount.totalCents };
}
