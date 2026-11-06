// Turns an audit row's stored details into a few readable facts for the audit trail page.
// The details are whatever was written at the time, so every field is read defensively: a
// missing or mistyped field is skipped rather than shown wrong. Nothing is computed here; the
// amounts are the ones recorded in the change, all excl. VAT so they compare: rent and list
// prices are stored net, and for a buyout or exit price the stored net amount is used.
import { assetConditionSchema, type AssetCondition } from '@/data/schemas';

export type AuditFactValue =
  | { type: 'money'; cents: number }
  | { type: 'months'; months: number }
  | { type: 'date'; iso: string }
  | { type: 'condition'; from: AssetCondition; to: AssetCondition };

export type AuditFactKey =
  | 'rent'
  | 'term'
  | 'downPayment'
  | 'validUntil'
  | 'saving'
  | 'extra'
  | 'effective'
  | 'buyout'
  | 'exitPrice'
  | 'condition'
  | 'listPrice'
  | 'refurbishment';

export type AuditFact = { key: AuditFactKey; value: AuditFactValue };

type Fields = Record<string, unknown>;

function record(value: unknown): Fields | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Fields)
    : undefined;
}

function cents(value: unknown): number | undefined {
  return Number.isInteger(value) ? (value as number) : undefined;
}

function isoDate(value: unknown): string | undefined {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : undefined;
}

function condition(value: unknown): AssetCondition | undefined {
  const parsed = assetConditionSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

/** Collects facts, dropping the ones whose value was missing or mistyped. */
function collect(entries: [AuditFactKey, AuditFactValue | undefined][]): AuditFact[] {
  return entries.flatMap(([key, value]) => (value ? [{ key, value }] : []));
}

const money = (value: unknown): AuditFactValue | undefined => {
  const amount = cents(value);
  return amount === undefined ? undefined : { type: 'money', cents: amount };
};

const positiveMoney = (value: unknown): AuditFactValue | undefined => {
  const amount = cents(value);
  return amount === undefined || amount <= 0 ? undefined : { type: 'money', cents: amount };
};

const date = (value: unknown): AuditFactValue | undefined => {
  const iso = isoDate(value);
  return iso === undefined ? undefined : { type: 'date', iso };
};

function quoteFacts(details: Fields): AuditFact[] {
  const months = cents(details.termMonths);
  return collect([
    ['rent', money(details.monthlyNetRentCents)],
    ['term', months && months > 0 ? { type: 'months', months } : undefined],
    ['downPayment', positiveMoney(details.downPaymentCents)],
    ['validUntil', date(details.validUntil)],
  ]);
}

function signedFacts(details: Fields): AuditFact[] {
  return collect([
    ['rent', money(details.monthlyNetRentCents)],
    [
      'saving',
      details.priceCheck === 'cheaper_today' ? money(details.savingPerMonthCents) : undefined,
    ],
    [
      'extra',
      details.priceCheck === 'dearer_today' ? money(details.extraPerMonthCents) : undefined,
    ],
  ]);
}

function endedFacts(details: Fields): AuditFact[] {
  const earlyExit = record(details.earlyExit);
  const option =
    details.kind === 'early_buy'
      ? record(earlyExit?.buy)
      : details.kind === 'early_hand_back'
        ? record(earlyExit?.handBack)
        : undefined;
  return collect([
    ['effective', date(details.effectiveDate)],
    ['buyout', money(record(details.buyoutInvoice)?.netCents)],
    ['exitPrice', money(option?.netCents)],
  ]);
}

function relistedFacts(details: Fields): AuditFact[] {
  const from = condition(record(details.from)?.condition);
  const to = condition(record(details.to)?.condition);
  return collect([
    ['condition', from && to && from !== to ? { type: 'condition', from, to } : undefined],
    ['listPrice', money(details.listPriceCents)],
    ['refurbishment', positiveMoney(details.refurbishmentCents)],
  ]);
}

/** The headline facts of one audit row, in display order; empty for an action it doesn't know. */
export function auditFacts(action: string, details: unknown): AuditFact[] {
  const fields = record(details);
  if (!fields) return [];
  if (action === 'quote.created') return quoteFacts(fields);
  // Sent to the signatory locks the price like signing does; their signature starts it (D-050).
  if (action === 'contract.signed' || action === 'contract.sent_to_signatory') {
    return signedFacts(fields);
  }
  if (action === 'contract.signed_by_signatory') return collect([['effective', date(fields.asOf)]]);
  if (action.startsWith('contract.ended_')) return endedFacts(fields);
  if (action === 'asset.relisted') return relistedFacts(fields);
  return [];
}

export type AuditActor =
  | { type: 'customer'; name: string }
  | { type: 'role'; role: 'customer' | 'back_office' | 'applicant' }
  | { type: 'other'; text: string };

const roles: Record<string, 'customer' | 'back_office' | 'applicant'> = {
  customer: 'customer',
  'back-office': 'back_office',
  applicant: 'applicant',
};

/** Who made the change: a customer's name, a system role, or the stored text as is. */
export function auditActor(
  actor: string,
  customers: readonly { id: string; name: string }[]
): AuditActor {
  const customer = customers.find((candidate) => candidate.id === actor);
  if (customer) return { type: 'customer', name: customer.name };
  const role = Object.hasOwn(roles, actor) ? roles[actor] : undefined;
  if (role) return { type: 'role', role };
  return { type: 'other', text: actor };
}
