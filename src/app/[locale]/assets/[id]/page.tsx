// One asset: facts, condition, and the live price configurator (Spine steps 1–2).
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { cookies } from 'next/headers';
import { PERSONA_COOKIE } from '@/components/persona-cookie';
import { PriceConfigurator } from '@/components/price-configurator';
import { formatNumber } from '@/i18n/format';
import { getT } from '@/i18n/get-t';
import { isLocale } from '@/i18n/locales';
import { db } from '@/server/db';
import { todayIso } from '@/server/today';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export default async function AssetPage({
  params,
  searchParams,
}: PageProps<'/[locale]/assets/[id]'>) {
  const { locale, id } = await params;
  if (!isLocale(locale)) notFound();
  await connection();

  const t = getT(locale);
  const asset = await db.asset.findUnique({ where: { id } });
  if (!asset) notFound();

  const search = await searchParams;
  const asOfParam =
    typeof search.asOf === 'string' && ISO_DATE.test(search.asOf) ? search.asOf : null;
  const asOf = asOfParam ?? todayIso();
  const persona = (await cookies()).get(PERSONA_COOKIE)?.value ?? null;

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <Link
        href={`/${locale}${asOfParam ? `?asOf=${asOfParam}` : ''}`}
        className="text-sm text-emerald-800 hover:underline dark:text-emerald-300"
      >
        ← {t('asset.backToCatalogue')}
      </Link>

      <div className="mt-4 flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <p className="text-sm text-stone-600 dark:text-stone-400">{asset.make}</p>
          <h1 className="text-3xl font-semibold tracking-tight">{asset.model}</h1>
        </div>
        <p className="text-sm text-stone-600 dark:text-stone-400">
          {t(`category.${asset.category}` as Parameters<typeof t>[0])} ·{' '}
          {t(`condition.${asset.condition}` as Parameters<typeof t>[0])} ·{' '}
          {t(`usage.${asset.usage_unit}` as Parameters<typeof t>[0], {
            value: formatNumber(asset.usage_value, locale),
          })}
        </p>
      </div>

      {asset.status === 'available' || asset.status === 'returned' ? (
        <PriceConfigurator
          locale={locale}
          assetId={asset.id}
          personaId={persona}
          asOf={asOfParam}
        />
      ) : (
        <p className="mt-8 rounded-xl border border-dashed border-stone-300 p-6 text-stone-700 dark:border-stone-700 dark:text-stone-300">
          {t('asset.notAvailable')}
        </p>
      )}
      <p className="mt-6 text-xs text-stone-500 dark:text-stone-400">
        {t('catalogue.pricesOn', { date: asOf })}
      </p>
    </div>
  );
}
