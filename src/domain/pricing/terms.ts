// The lease terms an item may be offered (D43): the coefficient table's terms, capped per
// category by the team's `data/term-limits.json`. A laptop's residual curve is at 18 % by
// month 48 and its design life (D15) is 48 months, so a 48-month laptop lease would hand back
// an item with no second life; the cap keeps every lease short enough for a next life. Pure:
// the table and the limits come in as data, nothing here reads a file.
import {
  assetCategorySchema,
  type AssetCategory,
  type CoefficientTable,
  type TermLimits,
} from '@/data/schemas';

/** The terms the table offers, smallest first (12, 24, 36, 48 in the data pack). */
export function termsOf(table: CoefficientTable): number[] {
  return Object.keys(table.end_of_term_buyout_percent_of_financed)
    .map(Number)
    .sort((a, b) => a - b);
}

/**
 * The table's terms up to the category's cap, shortest first. A cap between two terms rounds
 * down to the terms the table has; a cap below the shortest term leaves nothing. An unknown
 * category is a programming error, so it throws (D23: parsed with `assetCategorySchema`).
 */
export function allowedTerms(
  category: AssetCategory,
  table: CoefficientTable,
  limits: TermLimits
): number[] {
  const known = assetCategorySchema.parse(category);
  const cap = limits.max_term_months[known];
  return termsOf(table).filter((term) => term <= cap);
}

/**
 * The longest term the table offers under the category's cap, or the cap itself when no term
 * of the table fits under it (then nothing can be leased and the refusal says so).
 */
export function longestAllowedTerm(
  category: AssetCategory,
  table: CoefficientTable,
  limits: TermLimits
): number {
  const allowed = allowedTerms(category, table, limits);
  return allowed.length > 0 ? allowed[allowed.length - 1]! : limits.max_term_months[category];
}

/** True when the table offers `termMonths` and the category's cap allows it. */
export function termAllowed(
  category: AssetCategory,
  termMonths: number,
  table: CoefficientTable,
  limits: TermLimits
): boolean {
  return allowedTerms(category, table, limits).includes(termMonths);
}

/** What the cap needs beside the table: the limits and the assets' categories. */
export type TermLimitSources = {
  table: CoefficientTable;
  termLimits: TermLimits;
  assets: readonly { id: string; category: AssetCategory }[];
};

/** The category of an asset in the data, or null when the data does not list it. */
export function categoryOf(
  assets: TermLimitSources['assets'],
  assetId: string
): AssetCategory | null {
  return assets.find((asset) => asset.id === assetId)?.category ?? null;
}

/**
 * The terms an asset may be offered: the table's under the cap of its category; none when the
 * data does not know the asset's category, so the cap cannot be checked.
 */
export function allowedTermsOf(data: TermLimitSources, assetId: string): number[] {
  const category = categoryOf(data.assets, assetId);
  return category ? allowedTerms(category, data.table, data.termLimits) : [];
}
