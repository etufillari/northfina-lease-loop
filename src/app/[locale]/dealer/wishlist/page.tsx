import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { assetConditionSchema } from '@/data/schemas';
import { formatIsoDate } from '@/i18n/format';
import { getT } from '@/i18n/get-t';
import { isLocale } from '@/i18n/locales';
import { db } from '@/server/db';
import { listWishlistRequests } from '@/server/wishlist';

export default async function WishlistPage({ params }: PageProps<'/[locale]/dealer/wishlist'>) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  await connection();
  const t = getT(locale);
  const requests = await listWishlistRequests(db);

  return (
    <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
      <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
        {t('dealer.wishlistTitle')}
      </h1>
      <p className="mt-3 text-lg text-stone-700 dark:text-stone-300">{t('dealer.wishlistIntro')}</p>
      <p className="mt-5 text-sm text-stone-600 dark:text-stone-400">
        {t('dealer.wishlistCount', { count: requests.length })}
      </p>
      {requests.length === 0 ? (
        <p className="mt-8 rounded-xl border border-dashed border-stone-300 p-6 text-stone-700 dark:border-stone-700 dark:text-stone-300">
          {t('dealer.wishlistEmpty')}
        </p>
      ) : (
        <div className="mt-8 overflow-x-auto rounded-2xl border border-stone-200 dark:border-stone-800">
          <table className="w-full text-left text-sm">
            <thead className="bg-stone-50 dark:bg-stone-900">
              <tr>
                <th className="px-4 py-3 font-semibold">{t('dealer.wishlistAsset')}</th>
                <th className="px-4 py-3 font-semibold">{t('dealer.wishlistCustomer')}</th>
                <th className="px-4 py-3 font-semibold">{t('dealer.wishlistCondition')}</th>
                <th className="px-4 py-3 font-semibold">{t('dealer.wishlistBudget')}</th>
                <th className="px-4 py-3 font-semibold">{t('dealer.wishlistTerm')}</th>
                <th className="px-4 py-3 font-semibold">{t('dealer.wishlistNeededBy')}</th>
                <th className="px-4 py-3 font-semibold">{t('dealer.wishlistRequested')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-200 dark:divide-stone-800">
              {requests.map((request) => (
                <tr key={request.id}>
                  <td className="px-4 py-3">
                    <span className="font-medium">{request.asset.id}</span>
                    <span className="ml-2 text-stone-600 dark:text-stone-400">
                      {request.asset.make} {request.asset.model}
                    </span>
                  </td>
                  <td className="px-4 py-3">{request.customer_id}</td>
                  <td className="px-4 py-3">
                    {t(`condition.${assetConditionSchema.parse(request.minimum_condition)}`)}
                  </td>
                  <td className="px-4 py-3">
                    {(request.max_monthly_net_rent_cents / 100).toFixed(0)} €
                  </td>
                  <td className="px-4 py-3">{request.preferred_term_months}</td>
                  <td className="px-4 py-3">{formatIsoDate(request.needed_by, locale)}</td>
                  <td className="px-4 py-3">
                    {' '}
                    {formatIsoDate(request.created_at.toISOString().slice(0, 10), locale)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
