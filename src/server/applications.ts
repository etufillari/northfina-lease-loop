import { z } from 'zod';
import type { PrismaClient } from '@/generated/prisma/client';
import type { QuestionsFile } from '@/data/schemas';
import { assetCategorySchema } from '@/data/schemas';
import {
  assessApplication,
  type ApplicationAnswers,
  type ApplicationContext,
} from '@/domain/application';
import {
  applicationCart,
  sameApplicationItems,
  type ApplicationQuoteItem,
} from '@/domain/application-cart';
import { priceChanges, quoteStillValid, sameSelection } from '@/domain/price-lock';
import { ApiError } from './api-response';
import type { ApplicationInput } from './application-input';
import { applicationSelectionSchema } from './application-input';
import { withAudit, type TransactionClient } from './audit';
import type { AccountIdentity } from './auth-session';
import type { CheckoutData } from './checkout-options';

export const applicationItemsSchema = z
  .array(
    applicationSelectionSchema.extend({
      name: z.string(),
      category: assetCategorySchema,
      available: z.boolean(),
      priceCents: z.number().int().nonnegative(),
      priceListVersion: z.number().int(),
      monthlyNetCents: z.number().int().nonnegative(),
      monthlyTotalCents: z.number().int().nonnegative(),
      buyoutCents: z.number().int().nonnegative(),
      totalCents: z.number().int().nonnegative(),
    })
  )
  .min(1)
  .max(10);

export async function createLeaseApplication(
  database: PrismaClient,
  identity: AccountIdentity,
  input: ApplicationInput,
  data: CheckoutData,
  bank: QuestionsFile
) {
  const cart = applicationCart(data, input.items);
  if (!cart) throw new ApiError(409, 'QUOTE_CHANGED', 'Please review your cart.');
  const result = assessApplication(bank, cart.context, input.answers);
  if (result.status === 'incomplete')
    throw new ApiError(422, 'INCOMPLETE_APPLICATION', 'Please check your answers.', {
      questions: result.missing,
    });
  return withAudit(
    database,
    {
      actor: identity.id,
      action: 'application.submitted',
      entityType: 'customer',
      entityId: identity.customerId,
      details: { status: result.status, reasons: result.reasons, itemCount: cart.items.length },
    },
    (tx) =>
      tx.leaseApplication.create({
        data: {
          customerId: identity.customerId,
          startDate: data.today,
          status: result.status,
          answersJson: JSON.stringify(result.answers),
          reasonsJson: JSON.stringify(result.reasons),
          itemsJson: JSON.stringify(cart.items),
        },
        select: { id: true, status: true },
      })
  );
}

export async function findCustomerApplication(
  database: PrismaClient,
  customerId: string,
  id: string
) {
  return database.leaseApplication.findFirst({ where: { id, customerId } });
}

/**
 * Called inside the checkout write transaction; neither a client flag nor another customer's ID is
 * approval. The approval must be recent (QUOTE_VALID_DAYS) and for the same selection. If prices
 * changed since the quote (card 2), eligibility is checked again with today's amounts and the
 * changes are returned, so checkout can require the customer to accept today's price.
 */
export async function requireApplicationApproval(
  tx: TransactionClient,
  customerId: string,
  id: string,
  current: { items: readonly ApplicationQuoteItem[]; context: ApplicationContext },
  today: string,
  bank: QuestionsFile
) {
  const application = await tx.leaseApplication.findFirst({ where: { id, customerId } });
  if (!application || application.status !== 'approved')
    throw new ApiError(403, 'APPLICATION_NOT_APPROVED', 'An approved application is required.');
  const quoted = applicationItemsSchema.parse(JSON.parse(application.itemsJson));
  const changed = () =>
    new ApiError(409, 'APPLICATION_CHANGED', 'Please apply again for the current cart and price.');
  if (!quoteStillValid(application.startDate, today) || !sameSelection(quoted, current.items))
    throw changed();
  if (!sameApplicationItems(quoted, current.items)) {
    const answers = z.record(z.string(), z.unknown()).parse(JSON.parse(application.answersJson));
    const again = assessApplication(bank, current.context, answers as ApplicationAnswers);
    if (again.status !== 'approved') throw changed();
  }
  return { application, quoted, changes: priceChanges(quoted, current.items) };
}
