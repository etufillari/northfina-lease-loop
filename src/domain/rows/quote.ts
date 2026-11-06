// The write schema of a `Quote` row (prisma/schema.prisma): the stored quote of D7.
import { z } from 'zod';
import { addDays } from '../civil-days';
import { QUOTE_VALID_DAYS } from '../pricing';
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

export const quoteRowSchema = z
  .strictObject({
    /** The database makes one when it is left out. */
    id: idSchema.optional(),
    asset_id: idSchema,
    quantity: quantitySchema,
    quote_date: isoDateSchema,
    valid_until: isoDateSchema,
    price_list_version: priceListVersionSchema,
    /** Per unit. */
    list_price_cents: centsSchema,
    down_payment_cents: centsSchema,
    financed_cents: centsSchema,
    band: bandSchema,
    factor_millionths: factorMillionthsSchema,
    term_months: termMonthsSchema,
    monthly_net_cents: centsSchema,
    buyout_cents: centsSchema,
    vat_rate_bp_at_quote: vatRateBpSchema,
    /** D90: the named next customer of a pass-on; null or left out for anyone (D55). */
    customer_id: idSchema.nullable().optional(),
  })
  .superRefine((row, ctx) => {
    checkLockedPrice(row, ctx);
    if (row.valid_until !== addDays(row.quote_date, QUOTE_VALID_DAYS)) {
      ctx.addIssue({
        code: 'custom',
        message: `a quote is valid ${QUOTE_VALID_DAYS} days from its day`,
        path: ['valid_until'],
      });
    }
  }, ON_VALID_FIELDS);
export type QuoteRow = z.infer<typeof quoteRowSchema>;
