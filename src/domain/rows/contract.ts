// The write schema of a `Contract` row (prisma/schema.prisma): the signed lease, its prices
// copied from the quote at signing. Signing parses with it (src/server/contracts.ts).
import { z } from 'zod';
import { termEndDate } from '../invoicing/dates';
import { contractStatusSchema } from '../statuses';
import {
  bandSchema,
  centsSchema,
  factorMillionthsSchema,
  idSchema,
  isoDateSchema,
  priceListVersionSchema,
  quantitySchema,
  termMonthsSchema,
  vatRateBpSchema,
  ON_VALID_FIELDS,
} from './fields';
import { checkLockedPrice } from './locked-price';

export const contractRowSchema = z
  .strictObject({
    id: idSchema.optional(),
    /** The contract number the customer sees. Its format is the contract slice's to choose. */
    number: z.string().min(1).max(40),
    application_id: idSchema,
    customer_id: idSchema,
    asset_id: idSchema,
    quantity: quantitySchema,
    /** The lease this asset had before (second life, D16). */
    previous_contract_id: idSchema.nullable().optional(),
    signed_on: isoDateSchema,
    start_date: isoDateSchema,
    /** Inclusive: the last day of the term. */
    end_date: isoDateSchema,
    term_months: termMonthsSchema,
    /** Per unit. */
    list_price_cents: centsSchema,
    down_payment_cents: centsSchema,
    financed_cents: centsSchema,
    band: bandSchema,
    factor_millionths: factorMillionthsSchema,
    monthly_net_cents: centsSchema,
    buyout_cents: centsSchema,
    vat_rate_bp_at_signing: vatRateBpSchema,
    price_list_version: priceListVersionSchema,
    status: contractStatusSchema,
    ended_on: isoDateSchema.nullable().optional(),
  })
  .superRefine((row, ctx) => {
    checkLockedPrice(row, ctx);
    const issue = (path: string, message: string) =>
      ctx.addIssue({ code: 'custom', message, path: [path] });
    // ISO days compare correctly as strings.
    if (row.start_date < row.signed_on) issue('start_date', 'the term starts before signing');
    if (row.end_date !== termEndDate(row.start_date, row.term_months)) {
      issue('end_date', 'the end is not the last day of the term (D4)');
    }
    const ended = row.ended_on ?? null;
    if ((row.status === 'active') !== (ended === null)) {
      issue('ended_on', 'only an ended contract has an end day');
    }
    if (ended !== null && ended < row.start_date) issue('ended_on', 'ended before it started');
    if (row.id !== undefined && row.previous_contract_id === row.id) {
      issue('previous_contract_id', 'a contract cannot follow itself');
    }
  }, ON_VALID_FIELDS);
export type ContractRow = z.infer<typeof contractRowSchema>;
