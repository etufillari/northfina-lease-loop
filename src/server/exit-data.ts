// What an exit needs to be planned, read through each owner's read function (team rule 3):
// the contract (contract slice), the asset (catalogue), the invoices (invoices) and the data
// pack's curves, refurbishment costs, VAT rates and the band's interest rate. Both
// `src/server/exits.ts` (to plan and write) and the invoice handler (to bill the same amount
// from the event inside the transaction) build the plan from here, so they cannot disagree.
import {
  loadCoefficientTable,
  loadPriceLists,
  loadRefurbishmentCosts,
  loadResidualCurves,
  loadVatRates,
} from '@/data/load';
import type {
  Asset,
  CoefficientTable,
  PriceList,
  RefurbishmentCosts,
  ResidualCurves,
  VatRates,
} from '@/data/schemas';
import type { PlanExitInput } from '@/domain/exits';
import { usageAtLastReset, usageAtLastService } from '@/domain/refurbishment/plan';
import { firstLeaseCurve } from '@/domain/second-life/first-lease';
import type { TransactionClient } from './audit';
import { getAsset } from './assets';
import { getContract, listAssetContracts, type ContractView } from './contracts';
import { listInvoices, type InvoiceView } from './invoices';
import { assessmentHistory } from './second-life';
import type { PrismaClient } from './prisma-client';

export type ExitData = {
  curves: ResidualCurves;
  costs: RefurbishmentCosts;
  vatRates: VatRates;
  table: CoefficientTable;
  /** For D60's list price of an item the pack counts past lives for. */
  priceLists: PriceList[];
};

export async function loadExitData(): Promise<ExitData> {
  const [curves, costs, vatRates, table, priceLists] = await Promise.all([
    loadResidualCurves(),
    loadRefurbishmentCosts(),
    loadVatRates(),
    loadCoefficientTable(),
    loadPriceLists(),
  ]);
  return { curves, costs, vatRates, table, priceLists };
}

export type ExitContext = {
  contract: ContractView;
  asset: Asset;
  invoices: InvoiceView[];
  /** Every contract on the asset, oldest signing first: D60 reads the first one. */
  assetContracts: ContractView[];
  /** The asset's past assessments, newest first: the hours at the last major service. */
  assessments: { usageValue: number; stepIds: string[] }[];
};

/**
 * The contract, its asset and its invoices, or null for an unknown contract. On the client or,
 * inside the exit's transaction, on its `tx`: the owners' read functions accept both.
 */
export async function readExitContext(
  db: PrismaClient | TransactionClient,
  contractId: string
): Promise<ExitContext | null> {
  const contract = await getContract(db, contractId);
  if (!contract) return null;
  const [asset, invoices, assetContracts, assessments] = await Promise.all([
    getAsset(db, contract.assetId),
    listInvoices(db, contractId),
    listAssetContracts(db, contract.assetId),
    assessmentHistory(db, contract.assetId),
  ]);
  if (!asset) throw new Error(`Contract ${contractId} names a missing asset`);
  return { contract, asset, invoices, assetContracts, assessments };
}

export type ExitChoice = Pick<
  PlanExitInput,
  'mode' | 'today' | 'reported' | 'reason' | 'nextCustomerId'
>;

function curveOf(context: ExitContext, data: ExitData, today: string) {
  const { contract, asset, assetContracts } = context;
  const curve = firstLeaseCurve({
    assetId: asset.id,
    modelYear: asset.model_year,
    previousLives: asset.previous_lives,
    contracts: assetContracts,
    priceLists: data.priceLists,
    today,
  });
  if (!curve) throw new Error(`Asset ${asset.id} of contract ${contract.id} has no list price`);
  return curve;
}

/** The pure planner's input from the rows, the data and the customer's choice. */
export function planInputOf(
  context: ExitContext,
  data: ExitData,
  choice: ExitChoice
): PlanExitInput {
  const { contract, asset, invoices } = context;
  const band = data.table.bands.find((b) => b.band === contract.band);
  if (!band) throw new Error(`Contract ${contract.id} has band ${contract.band}, not in the table`);
  return {
    ...choice,
    contract: {
      id: contract.id,
      customerId: contract.customerId,
      assetId: contract.assetId,
      status: contract.status,
      financedCents: contract.financedCents,
      monthlyNetCents: contract.monthlyNetCents,
      termMonths: contract.termMonths,
      buyoutCents: contract.buyoutCents,
      endDate: contract.endDate,
      startDate: contract.startDate,
      unitListPriceCents: contract.unitListPriceCents,
      quantity: contract.quantity,
    },
    invoices: invoices.map((i) => ({ id: i.id, kind: i.kind, status: i.status })),
    asset: { category: asset.category },
    // Not written during the lease: the asset as it was leased (D77).
    atSigning: { condition: asset.condition, usage: asset.usage },
    usageAtLastService: usageAtLastService(context.assessments, asset.category, data.costs),
    // D83: the odometer at the last battery replacement, from the same assessment history.
    usageAtLastReset: usageAtLastReset(context.assessments, asset.category, data.costs),
    // D60, the read the assessment uses too (review finding 1). A relisted item's contract price
    // is its second-life amount; no price list for an item with past lives is a data error.
    curve: curveOf(context, data, choice.today),
    annualInterestPercent: band.annual_interest_percent,
    curves: data.curves,
    costs: data.costs,
    vatRates: data.vatRates,
  };
}
