// Zod schemas for the records the app creates: applications, contracts, invoices and the
// lives of an asset. These are what the rest of the code sees; prisma/schema.prisma has the
// matching tables, and services convert rows to these shapes, parsing the JSON columns.
//
// Rates are stored as whole numbers so that no calculation depends on a float:
// - `factor_micros`: 0.027584 is 27584.
// - `*_basis_points`: 25.5 % is 2550.
import { z } from 'zod';
import { assetConditionSchema, centsSchema, isoDateSchema } from './schemas';

const positiveIntSchema = z.number().int().positive();
const nonNegativeIntSchema = z.number().int().nonnegative();

// ---------------------------------------------------------------------------
// Allowed values
// ---------------------------------------------------------------------------

export const applicationDecisionSchema = z.enum(['approved', 'rejected', 'manual_review']);
export type ApplicationDecision = z.infer<typeof applicationDecisionSchema>;

/** The rule behind a decision: ids from `eligibility_rules` in data/questions.json. */
export const eligibilityReasonSchema = z.enum([
  'min_age',
  'residency',
  'affordability',
  'business_id',
  'pep_manual_review',
  'financed_limits',
]);
export type EligibilityReason = z.infer<typeof eligibilityReasonSchema>;

/** How a contract, and the asset life it belongs to, can end. */
export const lifeOutcomeSchema = z.enum(['bought_out', 'returned', 'passed_on', 'exited_early']);
export type LifeOutcome = z.infer<typeof lifeOutcomeSchema>;

export const contractStatusSchema = z.enum(['active', ...lifeOutcomeSchema.options]);
export type ContractStatus = z.infer<typeof contractStatusSchema>;

export const invoiceStatusSchema = z.enum(['issued', 'paid', 'cancelled']);
export type InvoiceStatus = z.infer<typeof invoiceStatusSchema>;

/** Why a deal cannot be priced. The UI translates these. */
export const quoteFailureReasonSchema = z.enum([
  'below_minimum',
  'above_maximum',
  'unsupported_term',
  'down_payment_too_high',
]);
export type QuoteFailureReason = z.infer<typeof quoteFailureReasonSchema>;

// ---------------------------------------------------------------------------
// Quote: the priced deal, before VAT. A contract locks a copy of it.
// ---------------------------------------------------------------------------

export const quoteSchema = z.strictObject({
  /** `null` for a re-listed item, which is priced from its own relist price. */
  price_list_version: positiveIntSchema.nullable(),
  base_price_cents: centsSchema,
  down_payment_cents: centsSchema,
  financed_cents: centsSchema,
  term_months: positiveIntSchema,
  band: z.string().min(1),
  factor_micros: positiveIntSchema,
  annual_interest_basis_points: nonNegativeIntSchema,
  monthly_net_rent_cents: centsSchema,
  buyout_cents: centsSchema,
});
export type Quote = z.infer<typeof quoteSchema>;

export type QuoteResult = { ok: true; quote: Quote } | { ok: false; reason: QuoteFailureReason };

// ---------------------------------------------------------------------------
// Application
// ---------------------------------------------------------------------------

/** One answer: text, a choice or a date as a string, money as cents, a list as strings. */
export const answerValueSchema = z.union([z.string(), z.number(), z.array(z.string())]);
export type AnswerValue = z.infer<typeof answerValueSchema>;

/** Question id → answer. */
export const answersSchema = z.record(z.string().regex(/^q_[a-z0-9_]+$/), answerValueSchema);
export type Answers = z.infer<typeof answersSchema>;

export const applicationSchema = z.strictObject({
  id: z.string().min(1),
  customer_id: z.string().min(1),
  asset_id: z.string().min(1),
  quantity: positiveIntSchema,
  quote_date: isoDateSchema,
  price_list_version: positiveIntSchema.nullable(),
  base_price_cents: centsSchema,
  down_payment_cents: centsSchema,
  financed_cents: centsSchema,
  term_months: positiveIntSchema,
  answers: answersSchema,
  decision: applicationDecisionSchema,
  reasons: z.array(eligibilityReasonSchema),
  reviewed_by: z.string().min(1).nullable(),
  reviewed_on: isoDateSchema.nullable(),
});
export type Application = z.infer<typeof applicationSchema>;

// ---------------------------------------------------------------------------
// Contract
// ---------------------------------------------------------------------------

export const contractSchema = z.strictObject({
  ...quoteSchema.shape,
  id: z.string().min(1),
  application_id: z.string().min(1),
  customer_id: z.string().min(1),
  asset_id: z.string().min(1),
  quantity: positiveIntSchema,
  quote_date: isoDateSchema,
  signed_on: isoDateSchema,
  start_on: isoDateSchema,
  planned_end_on: isoDateSchema,
  actual_end_on: isoDateSchema.nullable(),
  status: contractStatusSchema,
});
export type Contract = z.infer<typeof contractSchema>;

// ---------------------------------------------------------------------------
// Invoice
// ---------------------------------------------------------------------------

export const invoiceSchema = z.strictObject({
  id: z.string().min(1),
  contract_id: z.string().min(1),
  sequence: positiveIntSchema,
  period_start: isoDateSchema,
  period_end: isoDateSchema,
  invoice_date: isoDateSchema,
  due_date: isoDateSchema,
  net_cents: centsSchema,
  vat_rate_basis_points: nonNegativeIntSchema,
  vat_cents: centsSchema,
  total_cents: centsSchema,
  status: invoiceStatusSchema,
});
export type Invoice = z.infer<typeof invoiceSchema>;

// ---------------------------------------------------------------------------
// AssetLife: nullable fields are unknown for lives from before the app.
// ---------------------------------------------------------------------------

export const assetLifeSchema = z.strictObject({
  id: z.string().min(1),
  asset_id: z.string().min(1),
  life_number: positiveIntSchema,
  contract_id: z.string().min(1).nullable(),
  first_lease_price_cents: centsSchema.nullable(),
  started_on: isoDateSchema.nullable(),
  ended_on: isoDateSchema.nullable(),
  outcome: lifeOutcomeSchema.nullable(),
  start_condition: assetConditionSchema.nullable(),
  start_usage_value: nonNegativeIntSchema.nullable(),
  end_condition: assetConditionSchema.nullable(),
  end_usage_value: nonNegativeIntSchema.nullable(),
});
export type AssetLife = z.infer<typeof assetLifeSchema>;
