// The team's plausibility rules of the question flow (docs/decisions.md, the rules decided on
// 2026-11-06): a deal or an answer that may be true but is unlikely is held for a person, never
// refused here. Each rule returns its reason as a code with params (team rule 6).
import { assetCategorySchema, type ConsumerLimits } from '@/data/schemas';
import type { Reason } from './eligibility';

export type PlausibilityInput = {
  customerType: string;
  /** The asset's category; parsed here (D23) when a consumer rule needs it. */
  category?: string;
  quantity?: number;
  monthlyNetIncomeCents?: number;
  /** Not asked: undefined. Asked but not a number: null (counts as zero). */
  annualRevenueCents?: number | null;
  beneficialOwners?: readonly string[];
  financedCents: number;
};

export type OwnerShare = { name: string; hundredths: number | null };

/** "Name (60 %)", "Name (33,33%)": the name before the bracket and the share. */
const SHARE = /^(.*?)\s*\(\s*(\d{1,3})(?:[.,](\d{1,2}))?\s*%\s*\)\s*$/;

/**
 * Each owner line as a name (trimmed, inner spaces folded, lower case) and its share in
 * hundredths of a percent, or null when the line gives none. Whole numbers only: 33,33 % is
 * 3 333, so the sum is never a float.
 */
export function ownerShares(lines: readonly string[]): OwnerShare[] {
  return lines.map((line) => {
    const match = SHARE.exec(line);
    const raw = match ? match[1]! : line;
    const name = raw.trim().replace(/\s+/g, ' ').toLowerCase();
    if (!match) return { name, hundredths: null };
    const decimals = (match[3] ?? '').padEnd(2, '0');
    return { name, hundredths: Number(match[2]) * 100 + Number(decimals) };
  });
}

/**
 * Why the owner list cannot be right, or null: the stated shares sum over 100 %, or a name
 * appears twice. Lines without a share stay free text for a person to read.
 */
export function ownersProblem(lines: readonly string[]): 'over_100' | 'duplicate' | null {
  const shares = ownerShares(lines);
  const total = shares.reduce((sum, owner) => sum + (owner.hundredths ?? 0), 0);
  if (total > 100 * 100) return 'over_100';
  const names = shares.map((owner) => owner.name).filter((name) => name !== '');
  if (new Set(names).size !== names.length) return 'duplicate';
  return null;
}

/**
 * The plausibility holds, in this order: a consumer quantity over the category cap, a category
 * a person always checks for consumers, a monthly income over the ceiling, a company revenue
 * below the financed amount (missing or zero counts as below), an owner list that cannot be
 * right. The consumer rules need `limits`; without them they are not applied.
 */
export function plausibilityHolds(
  limits: ConsumerLimits | undefined,
  input: PlausibilityInput
): Reason[] {
  const held: Reason[] = [];
  if (limits && input.customerType === 'consumer' && input.category !== undefined) {
    const category = assetCategorySchema.parse(input.category);
    const maxQuantity = limits.max_consumer_quantity[category];
    const quantity = input.quantity ?? 1;
    if (quantity > maxQuantity) {
      held.push({
        code: 'quantity_over_consumer_cap',
        params: { category, quantity, maxQuantity },
      });
    }
    if (limits.consumer_manual_review[category]) {
      held.push({ code: 'category_needs_review', params: { category } });
    }
  }
  // D50: the ceiling is a consumer's (data/consumer-limits.json's note); companies and sole
  // traders are not capped here (wave 3 finding 13).
  if (limits && input.customerType === 'consumer' && input.monthlyNetIncomeCents !== undefined) {
    const ceilingCents = limits.income_ceiling_cents;
    if (input.monthlyNetIncomeCents > ceilingCents) {
      held.push({
        code: 'income_implausible',
        params: { incomeCents: input.monthlyNetIncomeCents, ceilingCents },
      });
    }
  }
  if (input.customerType === 'company' && input.annualRevenueCents !== undefined) {
    const revenueCents = input.annualRevenueCents ?? 0;
    if (revenueCents < input.financedCents) {
      held.push({
        code: 'revenue_below_financed',
        params: { revenueCents, financedCents: input.financedCents },
      });
    }
  }
  const owners = input.beneficialOwners ? ownersProblem(input.beneficialOwners) : null;
  if (owners) held.push({ code: 'owners_implausible', params: { reason: owners } });
  return held;
}
