import { comparePriceOptions, type PriceComparisonInput } from './price-comparison';
import type { PriceExplanation } from './price-explanation';

export type PriceGuardianInput = Omit<PriceComparisonInput, 'termMonths'> & {
  termMonths: number;
};

export type PriceGuardianSuggestion = {
  current: PriceExplanation;
  alternative: PriceExplanation;
  savings: {
    useNetCents: number;
    ownNetCents: number;
    useGrossCents: number;
    ownGrossCents: number;
  };
};

/**
 * Read-only, bounded search: zero upfront and both ends of each financing band.
 * A suggestion changes the band, never raises upfront/monthly rent, and costs less
 * under BOTH end choices, net and with forecast VAT. A larger optional buyout is
 * allowed only within those lower full totals. This is not a global optimiser or
 * an eligibility decision. All rounding and dated tax stay in the existing engine.
 */
export function findPriceGuardianSuggestion(
  input: PriceGuardianInput
): PriceGuardianSuggestion | null {
  const termMonths = [input.termMonths];
  const selected = comparePriceOptions({ ...input, termMonths })[0];
  if (!selected?.ok) return null;
  const current = selected.explanation;
  const downPayments = new Set([0]);
  for (const band of input.table.bands) {
    downPayments.add(input.listPriceCents - band.min_financed_cents);
    downPayments.add(input.listPriceCents - band.max_financed_cents);
  }

  const suggestions: PriceGuardianSuggestion[] = [];
  for (const downPaymentCents of downPayments) {
    if (
      !Number.isSafeInteger(downPaymentCents) ||
      downPaymentCents < 0 ||
      downPaymentCents >= input.downPaymentCents
    ) {
      continue;
    }
    const option = comparePriceOptions({ ...input, downPaymentCents, termMonths })[0];
    if (!option?.ok) continue;
    const alternative = option.explanation;
    if (
      alternative.terms.band === current.terms.band ||
      alternative.terms.monthlyNetCents > current.terms.monthlyNetCents ||
      alternative.upfront.grossCents > current.upfront.grossCents ||
      alternative.useNetCents >= current.useNetCents ||
      alternative.ownNetCents >= current.ownNetCents ||
      alternative.useGrossCents >= current.useGrossCents ||
      alternative.ownGrossCents >= current.ownGrossCents
    ) {
      continue;
    }
    suggestions.push({
      current,
      alternative,
      savings: {
        useNetCents: current.useNetCents - alternative.useNetCents,
        ownNetCents: current.ownNetCents - alternative.ownNetCents,
        useGrossCents: current.useGrossCents - alternative.useGrossCents,
        ownGrossCents: current.ownGrossCents - alternative.ownGrossCents,
      },
    });
  }

  // Stable preference among the checked candidates, not across every possible cent.
  suggestions.sort(
    (a, b) =>
      b.savings.useGrossCents - a.savings.useGrossCents ||
      b.savings.ownGrossCents - a.savings.ownGrossCents ||
      a.alternative.terms.downPaymentCents - b.alternative.terms.downPaymentCents
  );
  return suggestions[0] ?? null;
}
