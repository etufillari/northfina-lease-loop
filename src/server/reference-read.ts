// Reads the seeded reference tables from SQLite and converts integer rates (basis points,
// parts per million, grams) back into the validated `src/data/schemas.ts` shapes expected by
// `src/domain/`.
//
// If a reference table in SQLite is empty or uninitialized (e.g. in unit tests that do not
// seed reference tables), each reader falls back to the corresponding loader in `src/data/load.ts`.
import {
  loadCo2Factors,
  loadCoefficientTable,
  loadPriceLists,
  loadQuestions,
  loadRefurbishmentCosts,
  loadResidualCurves,
  loadSecondLifeDemand,
  loadVatRates,
} from '@/data/load';
import {
  co2FactorsSchema,
  coefficientTableSchema,
  priceListsFileSchema,
  questionsFileSchema,
  refurbishmentCostsSchema,
  residualCurvesSchema,
  secondLifeDemandFileSchema,
  vatRatesSchema,
  type Co2Factors,
  type CoefficientTable,
  type PriceList,
  type QuestionsFile,
  type RefurbishmentCosts,
  type ResidualCurves,
  type SecondLifeRequest,
  type VatRates,
} from '@/data/schemas';
import type { PrismaClient } from './prisma-client';

/** 2550 basis points → 25.5 (%). */
export const bpToPercent = (bp: number): number => bp / 100;

/** 9500 basis points → 0.95 (multiplier or share). */
export const bpToFraction = (bp: number): number => bp / 10_000;

/** 27584 parts per million → 0.027584. */
export const ppmToFraction = (ppm: number): number => ppm / 1_000_000;

// --- Pure row → domain mappers -----------------------------------------------

export function fromPriceListRows(
  lists: readonly {
    version: number;
    valid_from: string;
    valid_to: string | null;
    note: string;
    entries: readonly { asset_id: string; price_cents: number }[];
  }[]
): PriceList[] {
  return priceListsFileSchema.parse(
    lists.map((list) => ({
      version: list.version,
      valid_from: list.valid_from,
      valid_to: list.valid_to,
      note: list.note,
      prices: Object.fromEntries(list.entries.map((entry) => [entry.asset_id, entry.price_cents])),
    }))
  );
}

export function fromCoefficientRows(row: {
  id: string;
  version: number;
  valid_from: string;
  currency: string;
  how_to_use: string;
  bands: readonly {
    band: string;
    min_financed_cents: number;
    max_financed_cents: number;
    annual_interest_bp: number;
    factors: readonly { term_months: number; factor_ppm: number }[];
  }[];
  buyouts: readonly { term_months: number; percent_bp: number }[];
}): CoefficientTable {
  const sortedBands = [...row.bands].sort((a, b) => a.min_financed_cents - b.min_financed_cents);
  return coefficientTableSchema.parse({
    id: row.id,
    version: row.version,
    valid_from: row.valid_from,
    currency: row.currency,
    how_to_use: row.how_to_use,
    end_of_term_buyout_percent_of_financed: Object.fromEntries(
      row.buyouts.map((b) => [String(b.term_months), bpToPercent(b.percent_bp)])
    ),
    bands: sortedBands.map((band) => ({
      band: band.band,
      min_financed_cents: band.min_financed_cents,
      max_financed_cents: band.max_financed_cents,
      annual_interest_percent: bpToPercent(band.annual_interest_bp),
      monthly_factor_by_term: Object.fromEntries(
        band.factors.map((f) => [String(f.term_months), ppmToFraction(f.factor_ppm)])
      ),
    })),
  });
}

export function fromVatRateRows(
  rows: readonly {
    country: string;
    rate_bp: number;
    valid_from: string;
    valid_to: string | null;
    fictional: boolean;
  }[]
): VatRates {
  const country = rows[0]?.country ?? 'FI';
  return vatRatesSchema.parse({
    country,
    note: 'Loaded from SQLite VatRate table',
    rates: rows.map((r) => ({
      rate_percent: bpToPercent(r.rate_bp),
      valid_from: r.valid_from,
      valid_to: r.valid_to,
      ...(r.fictional ? { fictional: true } : {}),
    })),
  });
}

export function fromResidualRows(input: {
  curvePoints: readonly { category: string; age_months: number; percent_bp: number }[];
  conditionMultipliers: readonly { condition: string; multiplier_bp: number }[];
  usageAdjustments: readonly {
    category: string;
    unit: string;
    percent_per_step_bp: number;
    step: number;
    max_total_percent_bp: number;
  }[];
}): ResidualCurves {
  const curvesByCategory: Record<string, [number, number][]> = {};
  for (const pt of input.curvePoints) {
    const list = curvesByCategory[pt.category] ?? (curvesByCategory[pt.category] = []);
    list.push([pt.age_months, bpToPercent(pt.percent_bp)]);
  }
  for (const list of Object.values(curvesByCategory)) {
    list.sort((a, b) => a[0] - b[0]);
  }

  return residualCurvesSchema.parse({
    how_to_use: 'Loaded from SQLite residual tables',
    curves: curvesByCategory,
    condition_multiplier: Object.fromEntries(
      input.conditionMultipliers.map((c) => [c.condition, bpToFraction(c.multiplier_bp)])
    ),
    usage_adjustment: Object.fromEntries(
      input.usageAdjustments.map((u) => [
        u.category,
        {
          unit: u.unit,
          percent_per_step: bpToPercent(u.percent_per_step_bp),
          step: u.step,
          max_total_percent: bpToPercent(u.max_total_percent_bp),
        },
      ])
    ),
  });
}

export function fromSecondLifeRequestRows(
  rows: readonly {
    id: string;
    category: string;
    max_monthly_net_rent_cents: number;
    min_condition: string;
    preferred_term_months: number;
    needed_by: string;
    who: string;
  }[]
): SecondLifeRequest[] {
  return secondLifeDemandFileSchema.parse(
    rows.map((r) => ({
      id: r.id,
      category: r.category,
      max_monthly_net_rent_cents: r.max_monthly_net_rent_cents,
      min_condition: r.min_condition,
      preferred_term_months: r.preferred_term_months,
      needed_by: r.needed_by,
      who: r.who,
    }))
  );
}

export function fromQuestionRows(input: {
  questions: readonly {
    id: string;
    type: string;
    text_en: string;
    text_fi: string;
    text_sv: string;
    text_et: string;
    why_we_ask_en: string;
    why_we_ask_fi: string | null;
    why_we_ask_sv: string | null;
    why_we_ask_et: string | null;
    ask_when_json: string;
    options_json: string | null;
    blocks_json: string | null;
    validation_format: string | null;
    validation_hint: string | null;
  }[];
  eligibilityRules: readonly { id: string; text: string }[];
}): QuestionsFile {
  return questionsFileSchema.parse({
    how_to_use: 'Loaded from SQLite Question and EligibilityRule tables',
    eligibility_rules: input.eligibilityRules.map((r) => ({ id: r.id, text: r.text })),
    questions: input.questions.map((q) => ({
      id: q.id,
      type: q.type,
      text: {
        en: q.text_en,
        fi: q.text_fi,
        sv: q.text_sv,
        et: q.text_et,
      },
      why_we_ask: {
        en: q.why_we_ask_en,
        ...(q.why_we_ask_fi ? { fi: q.why_we_ask_fi } : {}),
        ...(q.why_we_ask_sv ? { sv: q.why_we_ask_sv } : {}),
        ...(q.why_we_ask_et ? { et: q.why_we_ask_et } : {}),
      },
      ask_when: JSON.parse(q.ask_when_json) as unknown,
      ...(q.options_json ? { options: JSON.parse(q.options_json) as unknown } : {}),
      ...(q.blocks_json ? { blocks_application_when: JSON.parse(q.blocks_json) as unknown } : {}),
      ...(q.validation_format && q.validation_hint
        ? { validation: { format: q.validation_format, hint: q.validation_hint } }
        : {}),
    })),
  });
}

export function fromCo2Rows(input: {
  manufacturing: readonly { category: string; kg_co2e: number }[];
  settings: {
    note: string;
    refurbishment_share_of_new_bp: number;
    e_bike_avoided_car_g_per_km: number;
    avoided_by_reuse_formula_hint: string;
  };
}): Co2Factors {
  return co2FactorsSchema.parse({
    note: input.settings.note,
    manufacturing_new_kg: Object.fromEntries(
      input.manufacturing.map((m) => [m.category, m.kg_co2e])
    ),
    refurbishment_share_of_new: bpToFraction(input.settings.refurbishment_share_of_new_bp),
    e_bike_avoided_car_km_kg_per_km: input.settings.e_bike_avoided_car_g_per_km / 1000,
    avoided_by_reuse_formula_hint: input.settings.avoided_by_reuse_formula_hint,
  });
}

export function fromRefurbishmentRows(input: {
  upgrades: readonly {
    category: string;
    from_condition: string;
    to_condition: string;
    cost_cents: number;
  }[];
  fixedCosts: readonly {
    category: string;
    id: string;
    cost_cents: number;
    when_text: string;
    resets_usage: boolean;
    mandatory_before_next_lease: boolean;
  }[];
}): RefurbishmentCosts {
  const categoryData = (cat: 'e_bike' | 'laptop' | 'farm_machine') => ({
    condition_upgrades: Object.fromEntries(
      input.upgrades
        .filter((u) => u.category === cat)
        .map((u) => [`${u.from_condition}->${u.to_condition}`, u.cost_cents])
    ),
    fixed: input.fixedCosts
      .filter((f) => f.category === cat)
      .map((f) => ({
        id: f.id,
        cost_cents: f.cost_cents,
        when: f.when_text,
        ...(f.resets_usage ? { resets_usage: true } : {}),
        ...(f.mandatory_before_next_lease ? { mandatory_before_next_lease: true } : {}),
      })),
  });

  return refurbishmentCostsSchema.parse({
    note: 'Loaded from SQLite refurbishment tables',
    e_bike: categoryData('e_bike'),
    laptop: categoryData('laptop'),
    farm_machine: categoryData('farm_machine'),
  });
}

// --- Database readers with data-pack fallback --------------------------------

export async function readPriceLists(db: PrismaClient): Promise<PriceList[]> {
  try {
    const rows = await db.priceList.findMany({
      include: { entries: true },
      orderBy: { version: 'asc' },
    });
    if (rows.length > 0 && rows.some((r) => r.entries.length > 0)) return fromPriceListRows(rows);
  } catch {
    // Fall back to disk JSON when DB is not initialized in unit tests
  }
  return loadPriceLists();
}

export async function readCoefficientTable(db: PrismaClient): Promise<CoefficientTable> {
  try {
    const row = await db.coefficientTable.findFirst({
      orderBy: { version: 'desc' },
      include: {
        bands: { include: { factors: true } },
        buyouts: true,
      },
    });
    if (row && row.bands.length > 0) return fromCoefficientRows(row);
  } catch {
    // Fall back to disk JSON when DB is not initialized in unit tests
  }
  return loadCoefficientTable();
}

export async function readVatRates(db: PrismaClient): Promise<VatRates> {
  try {
    const rows = await db.vatRate.findMany({
      orderBy: { valid_from: 'asc' },
    });
    if (rows.length > 0) return fromVatRateRows(rows);
  } catch {
    // Fall back to disk JSON when DB is not initialized in unit tests
  }
  return loadVatRates();
}

export async function readResidualCurves(db: PrismaClient): Promise<ResidualCurves> {
  try {
    const [curvePoints, conditionMultipliers, usageAdjustments] = await Promise.all([
      db.residualCurvePoint.findMany({ orderBy: [{ category: 'asc' }, { age_months: 'asc' }] }),
      db.conditionMultiplier.findMany(),
      db.usageAdjustment.findMany(),
    ]);
    if (curvePoints.length > 0 && conditionMultipliers.length > 0 && usageAdjustments.length > 0) {
      return fromResidualRows({ curvePoints, conditionMultipliers, usageAdjustments });
    }
  } catch {
    // Fall back to disk JSON when DB is not initialized in unit tests
  }
  return loadResidualCurves();
}

export async function readSecondLifeDemand(db: PrismaClient): Promise<SecondLifeRequest[]> {
  try {
    const rows = await db.secondLifeRequest.findMany({
      orderBy: { id: 'asc' },
    });
    if (rows.length > 0) return fromSecondLifeRequestRows(rows);
  } catch {
    // Fall back to disk JSON when DB is not initialized in unit tests
  }
  return loadSecondLifeDemand();
}

export async function readQuestions(db: PrismaClient): Promise<QuestionsFile> {
  try {
    const [questions, eligibilityRules] = await Promise.all([
      db.question.findMany({ orderBy: { position: 'asc' } }),
      db.eligibilityRule.findMany({ orderBy: { position: 'asc' } }),
    ]);
    if (questions.length > 0) {
      return fromQuestionRows({ questions, eligibilityRules });
    }
  } catch {
    // Fall back to disk JSON when DB is not initialized in unit tests
  }
  return loadQuestions();
}

export async function readCo2Factors(db: PrismaClient): Promise<Co2Factors> {
  try {
    const [manufacturing, settings] = await Promise.all([
      db.co2ManufacturingFactor.findMany(),
      db.co2Settings.findUnique({ where: { id: 1 } }),
    ]);
    if (manufacturing.length > 0 && settings) {
      return fromCo2Rows({ manufacturing, settings });
    }
  } catch {
    // Fall back to disk JSON when DB is not initialized in unit tests
  }
  return loadCo2Factors();
}

export async function readRefurbishmentCosts(db: PrismaClient): Promise<RefurbishmentCosts> {
  try {
    const [upgrades, fixedCosts] = await Promise.all([
      db.refurbishmentUpgrade.findMany(),
      db.refurbishmentFixedCost.findMany(),
    ]);
    if (upgrades.length > 0 && fixedCosts.length > 0) {
      return fromRefurbishmentRows({ upgrades, fixedCosts });
    }
  } catch {
    // Fall back to disk JSON when DB is not initialized in unit tests
  }
  return loadRefurbishmentCosts();
}
