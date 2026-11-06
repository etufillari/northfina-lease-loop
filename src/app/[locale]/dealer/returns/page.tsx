// The dealer's returns overview: every return request, its status and the next action.
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { connection } from 'next/server';
import { ReturnsList } from '@/components/dealer/returns-list';
import { getT } from '@/i18n/get-t';
import { isLocale } from '@/i18n/locales';
import { db } from '@/server/db';
import { listReturnRequests } from '@/server/return-queries';

export default async function ReturnsPage({ params }: PageProps<'/[locale]/dealer/returns'>) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();

  // Always read the database: a request can change between two visits.
  await connection();

  const t = getT(locale);
  const items = await listReturnRequests(db);

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
      <div className="max-w-2xl">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{t('dealer.title')}</h1>
        <p className="mt-3 text-lg text-stone-700 dark:text-stone-300">{t('dealer.intro')}</p>
        <p className="mt-5 text-sm text-stone-600 dark:text-stone-400">
          {t('dealer.list.count', { count: items.length })}
        </p>
        <Link
          href={`/${locale}/dealer/wishlist`}
          className="mt-4 inline-flex rounded-xl border border-stone-300 px-4 py-2 font-medium hover:bg-stone-100 dark:border-stone-700 dark:hover:bg-stone-800"
        >
          {t('dealer.wishlistLink')}
        </Link>
      </div>
      <ReturnsList items={items} locale={locale} t={t} />
    </div>
  );
}
