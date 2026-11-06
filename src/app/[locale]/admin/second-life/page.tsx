// Admin, Second life: the items that came back and wait for a check, and the ones already
// refurbished for a new life. Each returned item opens the workbench.
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { StatusBadge } from '@/components/status-badge';
import { loadCustomers } from '@/data/load';
import { formatEuro } from '@/domain/money';
import { formatNumber } from '@/i18n/format';
import { getT } from '@/i18n/get-t';
import { intlLocale, isLocale } from '@/i18n/locales';
import { toAsset } from '@/server/assets';
import { db } from '@/server/db';

export default async function SecondLifePage({ params }: PageProps<'/[locale]/admin/second-life'>) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  await connection();

  const t = getT(locale);
  const [returned, refurbished, customers] = await Promise.all([
    db.asset.findMany({ where: { status: 'returned' }, orderBy: { id: 'asc' } }),
    db.asset.findMany({
      where: { second_life_price_cents: { not: null }, status: { not: 'returned' } },
      orderBy: { updated_at: 'desc' },
    }),
    loadCustomers(),
  ]);
  const nameOf = (id: string | null) => customers.find((c) => c.id === id)?.name ?? null;

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
      <Link
        href={`/${locale}/admin`}
        className="text-sm font-medium text-stone-600 hover:text-stone-900 dark:text-stone-400"
      >
        ← {t('admin.title')}
      </Link>
      <h1 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">
        {t('secondLife.title')}
      </h1>
      <p className="mt-3 max-w-3xl text-lg text-stone-700 dark:text-stone-300">
        {t('secondLife.intro')}
      </p>

      <h2 className="mt-10 border-b border-stone-200 pb-2 text-xl font-semibold dark:border-stone-800">
        {t('secondLife.queue', { count: returned.length })}
      </h2>
      {returned.length === 0 ? (
        <p className="mt-4 text-stone-600 dark:text-stone-400">{t('secondLife.queueEmpty')}</p>
      ) : (
        <ul className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {returned.map((row) => {
            const asset = toAsset(row);
            const heldFor = nameOf(row.reserved_for);
            return (
              <li
                key={asset.id}
                className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm dark:border-stone-800 dark:bg-stone-900"
              >
                <p className="text-sm text-stone-600 dark:text-stone-400">{asset.make}</p>
                <p className="font-semibold">{asset.model}</p>
                <p className="mt-2 text-sm">
                  {t(`condition.${asset.condition}`)} ·{' '}
                  {t(`usage.${asset.usage.unit}`, {
                    value: formatNumber(asset.usage.value, locale),
                  })}{' '}
                  · {t('secondLife.lives', { count: asset.previous_lives })}
                </p>
                {heldFor ? (
                  <p className="mt-1 text-sm text-violet-800 dark:text-violet-300">
                    {t('secondLife.heldFor', { name: heldFor })}
                  </p>
                ) : null}
                <Link
                  href={`/${locale}/admin/second-life/${asset.id}`}
                  className="mt-4 inline-block rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800"
                >
                  {t('secondLife.open')}
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      <h2 className="mt-10 border-b border-stone-200 pb-2 text-xl font-semibold dark:border-stone-800">
        {t('secondLife.done')}
      </h2>
      {refurbished.length === 0 ? (
        <p className="mt-4 text-stone-600 dark:text-stone-400">{t('secondLife.doneEmpty')}</p>
      ) : (
        <ul className="mt-4 space-y-2">
          {refurbished.map((row) => {
            const asset = toAsset(row);
            return (
              <li
                key={asset.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-stone-200 bg-white px-4 py-3 dark:border-stone-800 dark:bg-stone-900"
              >
                <Link
                  href={`/${locale}/assets/${asset.id}`}
                  className="font-medium underline-offset-4 hover:underline"
                >
                  {asset.make} {asset.model}
                </Link>
                <span className="flex items-center gap-3 text-sm">
                  {t(`condition.${asset.condition}`)} ·{' '}
                  {formatEuro(row.second_life_price_cents ?? 0, intlLocale[locale])}
                  <StatusBadge status={asset.status} t={t} />
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
