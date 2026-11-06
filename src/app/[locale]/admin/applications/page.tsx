// The manual review queue: applications no rule could settle, for an admin to decide. The role
// is checked here so nobody else sees the cases, and again by the decision route.
import { notFound } from 'next/navigation';
import { connection } from 'next/server';

import { ManualReviewCard } from '@/components/admin/manual-review-card';
import { EmptyState } from '@/components/states/empty-state';
import { ErrorState } from '@/components/states/error-state';
import { can } from '@/domain/identity';
import { getT } from '@/i18n/get-t';
import { isLocale } from '@/i18n/locales';
import { manualReviewCases } from '@/server/application/manual-review';
import { getActor } from '@/server/auth/actor';
import { db } from '@/server/db';

export default async function ManualReviewPage({
  params,
}: PageProps<'/[locale]/admin/applications'>) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();

  // Render on every request: the queue changes with every decision.
  await connection();

  const t = getT(locale);
  const actor = await getActor();
  const allowed = actor !== null && can(actor.role, 'application.decide_manual_review');
  const cases = allowed ? await manualReviewCases(db, locale) : [];

  return (
    <main className="min-h-screen bg-stone-950 px-4 py-8 sm:py-12">
      <div className="mx-auto w-full max-w-4xl space-y-8">
        <header>
          <h1 className="text-2xl font-semibold text-stone-100">{t('staff.applications.title')}</h1>
          {allowed && (
            <p className="mt-2 text-sm text-stone-400">{t('admin.review.description')}</p>
          )}
        </header>

        {!allowed ? (
          <ErrorState
            title={t('admin.review.forbiddenTitle')}
            description={t('admin.review.forbiddenDescription')}
          />
        ) : cases.length === 0 ? (
          <EmptyState
            title={t('admin.review.emptyTitle')}
            description={t('admin.review.emptyDescription')}
          />
        ) : (
          <div className="space-y-6">
            {cases.map((reviewCase) => (
              <ManualReviewCard key={reviewCase.id} reviewCase={reviewCase} locale={locale} />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
