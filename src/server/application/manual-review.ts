// The cases waiting for a person, with what they need to decide: who is asking, for what, why a
// rule could not settle it, and what the customer answered. Oldest first, like a queue.
import type { Application } from '@/data/lease-schemas';
import { loadCustomers, loadQuestions } from '@/data/load';
import type { Customer } from '@/data/schemas';
import { reviewAnswers, type ReviewAnswer } from '@/domain/application/review-answers';
import type { PrismaClient } from '@/generated/prisma/client';
import type { Locale } from '@/i18n/locales';
import { listAssets } from '../assets/assets';
import { listApplications } from './applications';

export type ReviewCase = Pick<
  Application,
  | 'id'
  | 'customer_id'
  | 'asset_id'
  | 'quote_date'
  | 'term_months'
  | 'base_price_cents'
  | 'down_payment_cents'
  | 'financed_cents'
  | 'reasons'
> & {
  customer_name: string;
  customer_type: Customer['type'] | null;
  /** What our records say, which can differ from what the customer answered. */
  recorded_pep: boolean;
  asset_name: string;
  answers: ReviewAnswer[];
};

export async function manualReviewCases(db: PrismaClient, locale: Locale): Promise<ReviewCase[]> {
  const [applications, customers, assets, { questions }] = await Promise.all([
    listApplications(db, { decision: 'manual_review' }),
    loadCustomers(),
    listAssets(db),
    loadQuestions(),
  ]);

  return applications.map((application) => {
    const customer = customers.find(({ id }) => id === application.customer_id);
    const asset = assets.find(({ id }) => id === application.asset_id);

    return {
      id: application.id,
      customer_id: application.customer_id,
      asset_id: application.asset_id,
      quote_date: application.quote_date,
      term_months: application.term_months,
      base_price_cents: application.base_price_cents,
      down_payment_cents: application.down_payment_cents,
      financed_cents: application.financed_cents,
      reasons: application.reasons,
      customer_name: customer?.name ?? application.customer_id,
      customer_type: customer?.type ?? null,
      recorded_pep: customer?.is_pep ?? false,
      asset_name: asset ? `${asset.make} ${asset.model}` : application.asset_id,
      answers: reviewAnswers(questions, application.answers, locale),
    };
  });
}
