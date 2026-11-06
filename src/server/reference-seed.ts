// Writes the reference tables (everything in data/ except assets) to the database.
// Reference data is read-only for the app, so seeding upserts: running it again makes
// the rows match data/ without deleting anything that quotes or contracts point to.
//
// Assets are seeded separately by `seedAssets` (./assets.ts), which never overwrites
// status changes. Seed assets first: price list entries point to them.
import type {
  CoefficientTable,
  Co2Factors,
  Customer,
  PriceList,
  QuestionsFile,
  RefurbishmentCosts,
  ResidualCurves,
  SecondLifeRequest,
  VatRates,
} from '@/data/schemas';
import type { PrismaClient } from './prisma-client';
import {
  toCo2Rows,
  toCoefficientRows,
  toCustomerRow,
  toPriceListRows,
  toQuestionRows,
  toRefurbishmentRows,
  toResidualRows,
  toSecondLifeRequestRows,
  toVatRateRows,
} from './reference-rows';

export type ReferenceDataPack = {
  priceLists: readonly PriceList[];
  coefficientTable: CoefficientTable;
  vatRates: VatRates;
  residualCurves: ResidualCurves;
  refurbishmentCosts: RefurbishmentCosts;
  secondLifeDemand: readonly SecondLifeRequest[];
  questions: QuestionsFile;
  customers: readonly Customer[];
  co2Factors: Co2Factors;
};

/** Rows written per table, for the seed log. */
export type ReferenceSeedCounts = Record<string, number>;

/** Upserts every reference table in one transaction: all of it lands, or none. */
export async function seedReferenceData(
  db: PrismaClient,
  pack: ReferenceDataPack
): Promise<ReferenceSeedCounts> {
  const prices = toPriceListRows(pack.priceLists);
  const coefficient = toCoefficientRows(pack.coefficientTable);
  const vatRates = toVatRateRows(pack.vatRates);
  const residual = toResidualRows(pack.residualCurves);
  const refurb = toRefurbishmentRows(pack.refurbishmentCosts);
  const waitingList = toSecondLifeRequestRows(pack.secondLifeDemand);
  const questions = toQuestionRows(pack.questions);
  const customers = pack.customers.map(toCustomerRow);
  const co2 = toCo2Rows(pack.co2Factors);

  await db.$transaction(async (tx) => {
    for (const row of prices.priceLists) {
      await tx.priceList.upsert({ where: { version: row.version }, create: row, update: row });
    }
    for (const row of prices.entries) {
      const key = { price_list_version: row.price_list_version, asset_id: row.asset_id };
      await tx.priceListEntry.upsert({
        where: { price_list_version_asset_id: key },
        create: row,
        update: row,
      });
    }

    const table = coefficient.table;
    await tx.coefficientTable.upsert({ where: { id: table.id }, create: table, update: table });
    for (const row of coefficient.bands) {
      await tx.coefficientBand.upsert({
        where: { table_id_band: { table_id: row.table_id, band: row.band } },
        create: row,
        update: row,
      });
    }
    for (const row of coefficient.factors) {
      const key = { table_id: row.table_id, band: row.band, term_months: row.term_months };
      await tx.coefficientFactor.upsert({
        where: { table_id_band_term_months: key },
        create: row,
        update: row,
      });
    }
    for (const row of coefficient.buyouts) {
      await tx.buyoutPercent.upsert({
        where: { table_id_term_months: { table_id: row.table_id, term_months: row.term_months } },
        create: row,
        update: row,
      });
    }

    for (const row of vatRates) {
      await tx.vatRate.upsert({
        where: { country_valid_from: { country: row.country, valid_from: row.valid_from } },
        create: row,
        update: row,
      });
    }

    for (const row of residual.curvePoints) {
      await tx.residualCurvePoint.upsert({
        where: { category_age_months: { category: row.category, age_months: row.age_months } },
        create: row,
        update: row,
      });
    }
    for (const row of residual.conditionMultipliers) {
      await tx.conditionMultiplier.upsert({
        where: { condition: row.condition },
        create: row,
        update: row,
      });
    }
    for (const row of residual.usageAdjustments) {
      await tx.usageAdjustment.upsert({
        where: { category: row.category },
        create: row,
        update: row,
      });
    }

    for (const row of refurb.upgrades) {
      const key = {
        category: row.category,
        from_condition: row.from_condition,
        to_condition: row.to_condition,
      };
      await tx.refurbishmentUpgrade.upsert({
        where: { category_from_condition_to_condition: key },
        create: row,
        update: row,
      });
    }
    for (const row of refurb.fixedCosts) {
      await tx.refurbishmentFixedCost.upsert({
        where: { category_id: { category: row.category, id: row.id } },
        create: row,
        update: row,
      });
    }

    for (const row of waitingList) {
      await tx.secondLifeRequest.upsert({ where: { id: row.id }, create: row, update: row });
    }

    // `position` is unique: clear it first so reordering questions in data/ cannot
    // collide with an old position halfway through the upserts.
    await tx.question.updateMany({ data: { position: { increment: 1_000_000 } } });
    for (const row of questions.questions) {
      await tx.question.upsert({ where: { id: row.id }, create: row, update: row });
    }
    await tx.eligibilityRule.updateMany({ data: { position: { increment: 1_000_000 } } });
    for (const row of questions.eligibilityRules) {
      await tx.eligibilityRule.upsert({ where: { id: row.id }, create: row, update: row });
    }

    for (const row of customers) {
      await tx.customer.upsert({ where: { id: row.id }, create: row, update: row });
    }

    for (const row of co2.manufacturing) {
      await tx.co2ManufacturingFactor.upsert({
        where: { category: row.category },
        create: row,
        update: row,
      });
    }
    await tx.co2Settings.upsert({ where: { id: 1 }, create: co2.settings, update: co2.settings });
  });

  return {
    priceLists: prices.priceLists.length,
    priceListEntries: prices.entries.length,
    coefficientBands: coefficient.bands.length,
    coefficientFactors: coefficient.factors.length,
    buyoutPercents: coefficient.buyouts.length,
    vatRates: vatRates.length,
    residualCurvePoints: residual.curvePoints.length,
    conditionMultipliers: residual.conditionMultipliers.length,
    usageAdjustments: residual.usageAdjustments.length,
    refurbishmentUpgrades: refurb.upgrades.length,
    refurbishmentFixedCosts: refurb.fixedCosts.length,
    secondLifeRequests: waitingList.length,
    questions: questions.questions.length,
    eligibilityRules: questions.eligibilityRules.length,
    customers: customers.length,
    co2ManufacturingFactors: co2.manufacturing.length,
  };
}
