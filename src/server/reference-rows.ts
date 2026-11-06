// Data-pack shape → database rows for the reference tables (everything in data/ except
// assets, which live in ./assets.ts). Pure: no database, so every mapping is unit-tested.
//
// The data pack uses decimals for rates (25.5 %, ×0.95, factor 0.027584). The database
// stores integers only. Each conversion rounds once and then checks that nothing was
// lost: a value with more precision than the column holds throws instead of silently
// changing a price.
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

import { fractionToBp, fractionToPpm, percentToBp, toWholeNumber } from '@/domain/rounding';

export { fractionToBp, fractionToPpm, percentToBp, toWholeNumber };

// --- price-lists.json --------------------------------------------------------

export function toPriceListRows(lists: readonly PriceList[]) {
  return {
    priceLists: lists.map((list) => ({
      version: list.version,
      valid_from: list.valid_from,
      valid_to: list.valid_to,
      note: list.note,
    })),
    entries: lists.flatMap((list) =>
      Object.entries(list.prices).map(([assetId, priceCents]) => ({
        price_list_version: list.version,
        asset_id: assetId,
        price_cents: priceCents,
      }))
    ),
  };
}

// --- coefficient-table.json --------------------------------------------------

export function toCoefficientRows(table: CoefficientTable) {
  return {
    table: {
      id: table.id,
      version: table.version,
      valid_from: table.valid_from,
      currency: table.currency,
      how_to_use: table.how_to_use,
    },
    bands: table.bands.map((band) => ({
      table_id: table.id,
      band: band.band,
      min_financed_cents: band.min_financed_cents,
      max_financed_cents: band.max_financed_cents,
      annual_interest_bp: percentToBp(band.annual_interest_percent),
    })),
    factors: table.bands.flatMap((band) =>
      Object.entries(band.monthly_factor_by_term).map(([term, factor]) => ({
        table_id: table.id,
        band: band.band,
        term_months: Number(term),
        factor_ppm: fractionToPpm(factor),
      }))
    ),
    buyouts: Object.entries(table.end_of_term_buyout_percent_of_financed).map(
      ([term, percent]) => ({
        table_id: table.id,
        term_months: Number(term),
        percent_bp: percentToBp(percent),
      })
    ),
  };
}

// --- vat-rates.json ----------------------------------------------------------

export function toVatRateRows(vat: VatRates) {
  return vat.rates.map((rate) => ({
    country: vat.country,
    rate_bp: percentToBp(rate.rate_percent),
    valid_from: rate.valid_from,
    valid_to: rate.valid_to,
    fictional: rate.fictional ?? false,
  }));
}

// --- residual-curves.json ----------------------------------------------------

export function toResidualRows(residual: ResidualCurves) {
  return {
    curvePoints: Object.entries(residual.curves).flatMap(([category, points]) =>
      points.map(([ageMonths, percent]) => ({
        category,
        age_months: ageMonths,
        percent_bp: percentToBp(percent),
      }))
    ),
    conditionMultipliers: Object.entries(residual.condition_multiplier).map(
      ([condition, multiplier]) => ({ condition, multiplier_bp: fractionToBp(multiplier) })
    ),
    usageAdjustments: Object.entries(residual.usage_adjustment).map(([category, adj]) => ({
      category,
      unit: adj.unit,
      percent_per_step_bp: percentToBp(adj.percent_per_step),
      step: toWholeNumber(adj.step),
      max_total_percent_bp: percentToBp(adj.max_total_percent),
    })),
  };
}

// --- refurbishment-costs.json ------------------------------------------------

const REFURB_CATEGORIES = ['e_bike', 'laptop', 'farm_machine'] as const;

export function toRefurbishmentRows(costs: RefurbishmentCosts) {
  return {
    upgrades: REFURB_CATEGORIES.flatMap((category) =>
      Object.entries(costs[category].condition_upgrades).map(([step, costCents]) => {
        // The schema guarantees `from->to`.
        const [from_condition = '', to_condition = ''] = step.split('->');
        return { category, from_condition, to_condition, cost_cents: costCents };
      })
    ),
    fixedCosts: REFURB_CATEGORIES.flatMap((category) =>
      costs[category].fixed.map((cost) => ({
        category,
        id: cost.id,
        cost_cents: cost.cost_cents,
        when_text: cost.when,
        resets_usage: cost.resets_usage ?? false,
        mandatory_before_next_lease: cost.mandatory_before_next_lease ?? false,
      }))
    ),
  };
}

// --- second-life-demand.json -------------------------------------------------

export function toSecondLifeRequestRows(requests: readonly SecondLifeRequest[]) {
  return requests.map((r) => ({
    id: r.id,
    category: r.category,
    max_monthly_net_rent_cents: r.max_monthly_net_rent_cents,
    min_condition: r.min_condition,
    preferred_term_months: r.preferred_term_months,
    needed_by: r.needed_by,
    who: r.who,
  }));
}

// --- questions.json ----------------------------------------------------------

export function toQuestionRows(file: QuestionsFile) {
  return {
    questions: file.questions.map((q, position) => ({
      id: q.id,
      position,
      type: q.type,
      text_en: q.text.en,
      text_fi: q.text.fi,
      text_sv: q.text.sv,
      text_et: q.text.et,
      why_we_ask_en: q.why_we_ask.en,
      why_we_ask_fi: q.why_we_ask.fi ?? null,
      why_we_ask_sv: q.why_we_ask.sv ?? null,
      why_we_ask_et: q.why_we_ask.et ?? null,
      ask_when_json: JSON.stringify(q.ask_when),
      options_json: q.options ? JSON.stringify(q.options) : null,
      blocks_json: q.blocks_application_when ? JSON.stringify(q.blocks_application_when) : null,
      validation_format: q.validation?.format ?? null,
      validation_hint: q.validation?.hint ?? null,
    })),
    eligibilityRules: file.eligibility_rules.map((rule, position) => ({
      id: rule.id,
      position,
      text: rule.text,
    })),
  };
}

// --- customers.json ----------------------------------------------------------

export function toCustomerRow(customer: Customer) {
  const base = {
    id: customer.id,
    type: customer.type,
    name: customer.name,
    country: customer.country,
    city: customer.city,
    email: customer.email,
    is_pep: customer.is_pep,
    story: customer.story,
    birth_date: null as string | null,
    employment: null as string | null,
    monthly_net_income_cents: null as number | null,
    business_id: null as string | null,
    vat_registered: null as boolean | null,
    annual_revenue_cents: null as number | null,
    applicant_can_sign: null as boolean | null,
    beneficial_owners_json: null as string | null,
  };
  switch (customer.type) {
    case 'consumer':
      return {
        ...base,
        birth_date: customer.birth_date,
        employment: customer.employment,
        monthly_net_income_cents: customer.monthly_net_income_cents,
      };
    case 'sole_trader':
      return {
        ...base,
        birth_date: customer.birth_date,
        business_id: customer.business_id,
        vat_registered: customer.vat_registered,
      };
    case 'company':
      return {
        ...base,
        business_id: customer.business_id,
        vat_registered: customer.vat_registered,
        annual_revenue_cents: customer.annual_revenue_cents,
        applicant_can_sign: customer.applicant_can_sign,
        beneficial_owners_json: customer.beneficial_owners
          ? JSON.stringify(customer.beneficial_owners)
          : null,
      };
  }
}

// --- co2-factors.json --------------------------------------------------------

export function toCo2Rows(co2: Co2Factors) {
  return {
    manufacturing: Object.entries(co2.manufacturing_new_kg).map(([category, kg]) => ({
      category,
      kg_co2e: toWholeNumber(kg),
    })),
    settings: {
      id: 1,
      note: co2.note,
      refurbishment_share_of_new_bp: fractionToBp(co2.refurbishment_share_of_new),
      // kg → g so 0.15 kg/km stays an integer.
      e_bike_avoided_car_g_per_km: toWholeNumber(co2.e_bike_avoided_car_km_kg_per_km * 1000),
      avoided_by_reuse_formula_hint: co2.avoided_by_reuse_formula_hint,
    },
  };
}
