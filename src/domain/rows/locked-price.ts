// The money rules a quote and the contract signed from it share: the price is frozen once,
// so the frozen numbers must agree with each other (D1, D7, D8).
import type { z } from 'zod';
import { applyMillionths } from '../money-math';

export type LockedPrice = {
  quantity: number;
  list_price_cents: number;
  down_payment_cents: number;
  financed_cents: number;
  factor_millionths: number;
  monthly_net_cents: number;
};

/**
 * Adds an issue for each frozen number that does not follow from the others:
 * - the down payment is at most the price of every unit (list price × quantity);
 * - financed = list price × quantity − down payment;
 * - monthly net rent = financed × factor, rounded half up once (`applyMillionths`, D1).
 * The band and the factor are the coefficient table's to choose; pricing checks those.
 */
export function checkLockedPrice(row: LockedPrice, ctx: z.RefinementCtx): void {
  const totalCents = row.list_price_cents * row.quantity;
  if (row.down_payment_cents > totalCents) {
    ctx.addIssue({
      code: 'custom',
      message: 'the down payment is above the price',
      path: ['down_payment_cents'],
    });
    return;
  }
  if (row.financed_cents !== totalCents - row.down_payment_cents) {
    ctx.addIssue({
      code: 'custom',
      message: 'financed is not list price × quantity − down payment',
      path: ['financed_cents'],
    });
    return;
  }
  if (row.monthly_net_cents !== applyMillionths(row.financed_cents, row.factor_millionths)) {
    ctx.addIssue({
      code: 'custom',
      message: 'the rent is not financed × factor, rounded half up',
      path: ['monthly_net_cents'],
    });
  }
}
