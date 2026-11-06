import type { AssetCondition, RefurbishmentCosts, ResidualCurves } from '@/data/schemas';
import {
  assetRecovery,
  valuationFactors,
  valueAfterStandardWork,
  type RecoveryInput,
} from './asset-recovery';
import { conditionReport, repairLines, type ConditionAnswers } from './condition-report';
import { invoiceAmounts } from './lease-billing';
import { settlementQuote, type SettlementInput } from './lease-settlement';

type Facts = Pick<
  RecoveryInput,
  'category' | 'originalPriceCents' | 'ageMonths' | 'maintenanceUsageValue'
>;
export type ReturnPreviewContext = {
  baselineCondition: AssetCondition;
  recoveryFacts: Facts;
  finance: SettlementInput;
  costs: RefurbishmentCosts;
  curves: ResidualCurves;
};

/**
 * The one calculation behind the customer's estimate, the inspector's live figure and the saved
 * quote: ending early (what is still owed minus what the item is worth to us) plus the customer's
 * share of repairs for new damage. Nobody is charged more for repairs than the item was worth.
 */
export function quoteReturn(
  facts: Facts,
  finance: SettlementInput,
  findings: {
    condition: AssetCondition;
    targetCondition: AssetCondition;
    usageValue: number;
    additionalRepairCents: number;
    damageNetCents: number;
    skipBatteryTask?: boolean;
  },
  curves: ResidualCurves,
  costs: RefurbishmentCosts
) {
  const recovery = assetRecovery(
    {
      ...facts,
      condition: findings.condition,
      targetCondition: findings.targetCondition,
      usageValue: findings.usageValue,
      additionalRepairCents: findings.additionalRepairCents,
      skipBatteryTask: findings.skipBatteryTask,
    },
    curves,
    costs
  );
  const worthNetCents = valueAfterStandardWork(recovery);
  const damageNetCents = Math.min(findings.damageNetCents, recovery.postRepairValueCents);
  const settlement = settlementQuote({
    ...finance,
    recoveryCents: worthNetCents,
    damageCents: damageNetCents,
  });
  return { recovery, settlement, worthNetCents, damageNetCents };
}

/** The customer's estimate from their answers, with every number they would want to check. */
export function returnPreview(
  data: ReturnPreviewContext,
  answers: ConditionAnswers,
  usageValue: number
) {
  const { category, originalPriceCents, ageMonths } = data.recoveryFacts;
  const gross = (net: number) => invoiceAmounts(net, data.finance.vatBasisPoints).totalCents;
  const report = conditionReport(category, data.baselineCondition, answers, data.costs);
  const condition = report.cosmeticCondition;
  const target = condition === 'like_new' ? 'like_new' : 'good';
  const lines = repairLines(category, originalPriceCents, answers, ageMonths, data.costs);
  const partsNetCents = lines.reduce((sum, line) => sum + line.netCents, 0);
  const quote = quoteReturn(
    data.recoveryFacts,
    data.finance,
    {
      condition,
      targetCondition: target,
      usageValue,
      additionalRepairCents: partsNetCents,
      damageNetCents: report.damageNetCents + partsNetCents,
      skipBatteryTask: lines.some((line) => line.id === 'battery_weak'),
    },
    data.curves,
    data.costs
  );
  const earlyTotalCents = gross(quote.settlement.earlyReturnNetCents);
  return {
    ...report,
    lines: [
      ...lines.map((line) => ({
        id: line.id,
        netCents: line.netCents,
        totalCents: gross(line.netCents),
      })),
      ...(report.damageNetCents
        ? [
            {
              id: 'cosmetic',
              netCents: report.damageNetCents,
              totalCents: gross(report.damageNetCents),
            },
          ]
        : []),
    ],
    agreedPrice: {
      vatBasisPoints: data.finance.vatBasisPoints,
      earlyReturnNetCents: quote.settlement.earlyReturnNetCents,
      customerRepairNetCents: quote.settlement.customerRepairNetCents,
      repairShareBasisPoints: quote.settlement.repairShareBasisPoints,
    },
    returnTotalCents: quote.settlement.returnTotalCents,
    earlyReturnTotalCents: earlyTotalCents,
    owedTotalCents: gross(quote.settlement.buyoutNetCents),
    worthTotalCents: gross(quote.worthNetCents),
    repairsTotalCents: gross(quote.damageNetCents),
    // Taken from the total so the lines shown always add up to what is charged.
    customerRepairTotalCents: gross(quote.settlement.returnNetCents) - earlyTotalCents,
    /** Rounded for display only; the amount uses the exact share. */
    repairSharePercent: Math.round(quote.settlement.repairShareBasisPoints / 100),
    repairShareExactPercent: quote.settlement.repairShareBasisPoints / 100,
    paymentsLeft: data.finance.remainingMonths,
    monthlyTotalCents: gross(data.finance.monthlyNetCents),
    endPriceTotalCents: gross(data.finance.buyoutCents),
    interestSavedCents: Math.max(
      0,
      gross(
        data.finance.monthlyNetCents * data.finance.remainingMonths + data.finance.buyoutCents
      ) - gross(quote.settlement.buyoutNetCents)
    ),
    originalTotalCents: gross(originalPriceCents),
    standardWorkTotalCents: gross(quote.recovery.postRepairValueCents - quote.worthNetCents),
    factors: valuationFactors({ category, ageMonths, usageValue, condition: target }, data.curves),
    fullValueTotalCents: gross(quote.recovery.postRepairValueCents),
    unpaidCents: data.finance.outstandingCents,
    remainingMonths: data.finance.remainingMonths,
  };
}

/**
 * The same estimate as if the item came back at another point in the lease, for the calculator.
 * Later means fewer payments left and an older item. Arrears only count for the actual month.
 */
export function returnPreviewAtMonth(
  data: ReturnPreviewContext,
  answers: ConditionAnswers,
  usageValue: number,
  monthsIntoLease: number
) {
  const term = data.finance.termMonths ?? data.finance.remainingMonths;
  const paidNow = term - data.finance.remainingMonths;
  const month = Math.min(term, Math.max(0, monthsIntoLease));
  return returnPreview(
    {
      ...data,
      recoveryFacts: {
        ...data.recoveryFacts,
        ageMonths: Math.max(0, data.recoveryFacts.ageMonths + month - paidNow),
      },
      finance: {
        ...data.finance,
        remainingMonths: term - month,
        outstandingCents: month === paidNow ? data.finance.outstandingCents : 0,
      },
    },
    answers,
    usageValue
  );
}

/** The inspector's live figures while filling in the form. Null until the inputs make sense. */
export function assessmentPreview(
  data: ReturnPreviewContext,
  findings: Parameters<typeof quoteReturn>[2]
) {
  try {
    const quote = quoteReturn(data.recoveryFacts, data.finance, findings, data.curves, data.costs);
    return {
      customerPaysCents: quote.settlement.returnTotalCents,
      suggestedPriceNetCents: quote.recovery.postRepairValueCents,
      refurbishmentNetCents: quote.recovery.refurbishmentCostCents,
      customerRepairNetCents: quote.settlement.customerRepairNetCents,
    };
  } catch {
    return null;
  }
}
