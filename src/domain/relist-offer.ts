import type {
  AssetCategory,
  AssetCondition,
  CoefficientTable,
  RefurbishmentCosts,
  ResidualCurves,
  VatRate,
} from '@/data/schemas';
import { assetRecovery, recoveryAgeMonths, valuationFactors } from './asset-recovery';
import { checkoutQuote } from './checkout-quote';

export type RelistInput = {
  category: AssetCategory;
  originalPriceCents: number;
  firstLeaseDate: string;
  condition: AssetCondition;
  targetCondition: AssetCondition;
  usageValue: number;
  maintenanceUsageValue: number;
  additionalRepairCents: number;
  /** The second-life price saved with the quote, net. */
  quotedPriceCents: number;
  /** What the customer's settlement already pays toward the repairs. */
  customerRepairCents?: number;
  skipBatteryTask?: boolean;
  today: string;
};

/** The term used for the example payment, so offers can be compared with each other. */
export const relistExampleTermMonths = 36;

/**
 * The price an item would be published at today. An item can wait months between its quote and
 * its relisting, so age is recalculated here while the inspected facts stay as recorded. It uses
 * the same valuation as the quote, so an item relisted on its quote date keeps the quoted price.
 */
export function relistOffer(
  input: RelistInput,
  curves: ResidualCurves,
  costs: RefurbishmentCosts,
  table: CoefficientTable,
  rates: readonly VatRate[]
) {
  const ageMonths = recoveryAgeMonths(input.firstLeaseDate, input.today);
  const recovery = assetRecovery(
    {
      category: input.category,
      originalPriceCents: input.originalPriceCents,
      ageMonths,
      condition: input.condition,
      targetCondition: input.targetCondition,
      usageValue: input.usageValue,
      maintenanceUsageValue: input.maintenanceUsageValue,
      additionalRepairCents: input.additionalRepairCents,
      skipBatteryTask: input.skipBatteryTask,
    },
    curves,
    costs
  );
  const priceNetCents = recovery.postRepairValueCents;
  const customerRepair = input.customerRepairCents ?? 0;
  const example = checkoutQuote(
    priceNetCents,
    0,
    relistExampleTermMonths,
    input.today,
    table,
    rates
  );
  return {
    ageMonths,
    priceNetCents,
    priceChangeSinceQuoteCents: priceNetCents - input.quotedPriceCents,
    originalPriceCents: input.originalPriceCents,
    refurbishmentCostCents: recovery.refurbishmentCostCents,
    workItems: recovery.workItems,
    factors: valuationFactors(
      {
        category: input.category,
        ageMonths,
        usageValue: input.usageValue,
        condition: input.targetCondition,
      },
      curves
    ),
    customerRepairCents: customerRepair,
    /** Price, minus work, plus what the customer paid toward it. Negative is a loss. */
    netResultCents: priceNetCents - recovery.refurbishmentCostCents + customerRepair,
    monthlyTotalCents: example?.monthlyTotalCents ?? null,
    /** False when the price falls outside the financing table, so nobody could lease it. */
    leasable: example !== null,
  };
}
export type RelistOffer = ReturnType<typeof relistOffer>;
