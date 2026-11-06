// The dealer's work list: items that came back, and items held for someone. The role is checked
// here so nobody else sees it, and again by every route the buttons call.
import { notFound } from 'next/navigation';
import { connection } from 'next/server';

import { HeldItemCard } from '@/components/dealer/held-item-card';
import { ReturnedItemCard } from '@/components/dealer/returned-item-card';
import { EmptyState } from '@/components/states/empty-state';
import { ErrorState } from '@/components/states/error-state';
import { can } from '@/domain/identity';
import { getT } from '@/i18n/get-t';
import { isLocale } from '@/i18n/locales';
import { getActor } from '@/server/auth/actor';
import { db } from '@/server/db';
import { dealerDashboard, type DealerDashboard } from '@/server/second-life/dealer-dashboard';

const NOTHING: DealerDashboard = { returned: [], held: [] };

export default async function DealerDashboardPage({ params }: PageProps<'/[locale]/dealer'>) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();

  // Render on every request: the list changes with every re-listing.
  await connection();

  const t = getT(locale);
  const actor = await getActor();
  const allowed = actor !== null && can(actor.role, 'second_life.refurbish');
  const { returned, held } = allowed ? await dealerDashboard(db) : NOTHING;

  return (
    <main className="min-h-screen bg-stone-950 px-4 py-8 sm:py-12">
      <div className="mx-auto w-full max-w-4xl space-y-10">
        <header>
          <h1 className="text-2xl font-semibold text-stone-100">{t('dealer.title')}</h1>
          {allowed && <p className="mt-2 text-sm text-stone-400">{t('dealer.description')}</p>}
        </header>

        {!allowed ? (
          <ErrorState
            title={t('dealer.forbiddenTitle')}
            description={t('dealer.forbiddenDescription')}
          />
        ) : (
          <>
            <section className="space-y-4">
              <h2 className="text-lg font-semibold text-stone-100">{t('dealer.returned.title')}</h2>

              {returned.length === 0 ? (
                <EmptyState
                  title={t('dealer.returned.emptyTitle')}
                  description={t('dealer.returned.emptyDescription')}
                />
              ) : (
                <div className="space-y-6">
                  {returned.map((asset) => (
                    <ReturnedItemCard key={asset.id} asset={asset} locale={locale} />
                  ))}
                </div>
              )}
            </section>

            <section className="space-y-4">
              <h2 className="text-lg font-semibold text-stone-100">{t('dealer.held.title')}</h2>

              {held.length === 0 ? (
                <EmptyState
                  title={t('dealer.held.emptyTitle')}
                  description={t('dealer.held.emptyDescription')}
                />
              ) : (
                <div className="space-y-4">
                  {held.map((item) => (
                    <HeldItemCard key={item.id} item={item} locale={locale} />
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </main>
  );
}
