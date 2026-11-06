// One asset: facts, condition, and the live price configurator (Spine steps 1–2).
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { cookies } from 'next/headers';
import { AssetImage } from '@/components/asset-card';
import { customerPersona, PERSONA_COOKIE } from '@/components/persona-cookie';
import { PriceConfigurator } from '@/components/price-configurator';
import { formatEuro } from '@/domain/money';
import { formatNumber } from '@/i18n/format';
import { getT } from '@/i18n/get-t';
import { intlLocale, isLocale } from '@/i18n/locales';
import { checkClaim } from '@/server/asset-claims';
import { assetImageUrl } from '@/server/asset-images';
import { asOfFromPage } from '@/server/as-of';
import { db } from '@/server/db';

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

  const { asOf, asOfParam } = await asOfFromPage(await searchParams);
  const persona = customerPersona((await cookies()).get(PERSONA_COOKIE)?.value);
  // A returned item is in maintenance — except for the successor nominated for it.
  const nominatedForMe =
    asset.status === 'returned' &&
    persona !== null &&
    (await checkClaim(db, { assetIds: [asset.id], customerId: persona, asOf })).ok;

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
          {t(`category.${asset.category}` as Parameters<typeof t>[0])}
        </p>
      </div>

      <div className="mt-6 grid gap-6 sm:grid-cols-2">
        <AssetImage
          imageUrl={assetImageUrl(asset)}
          category={asset.category}
          alt={`${asset.make} ${asset.model}`}
          className="aspect-[3/2] w-full rounded-2xl border border-stone-200 object-cover dark:border-stone-800"
        />
        <dl className="grid content-start grid-cols-2 gap-x-4 gap-y-4 text-sm">
          <AssetFact
            label={t('condition.label')}
            value={t(`condition.${asset.condition}` as Parameters<typeof t>[0])}
          />
          <AssetFact label={t('asset.modelYear')} value={String(asset.model_year)} />
          <AssetFact
            label={t('asset.usage')}
            value={t(`usage.${asset.usage_unit}` as Parameters<typeof t>[0], {
              value: formatNumber(asset.usage_value, locale),
            })}
          />
          <AssetFact
            label={t('asset.previousLives')}
            value={formatNumber(asset.previous_lives, locale)}
          />
        </dl>
      </div>

      <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm">
        <Link
          href={`/${locale}/assets/${asset.id}/passport${asOfParam ? `?asOf=${asOfParam}` : ''}`}
          className="font-medium text-emerald-800 hover:underline dark:text-emerald-300"
        >
          {t('secondLife.passportLink')} →
        </Link>
        {asset.second_life_price_cents !== null && (
          <span className="text-stone-600 dark:text-stone-400">
            {t('asset.secondLifeNote', {
              price: formatEuro(asset.second_life_price_cents, intlLocale[locale]),
            })}
          </span>
        )}
      </p>

      {nominatedForMe ? (
        <p className="mt-6 rounded-xl bg-emerald-50 p-4 text-sm text-emerald-900 ring-1 ring-emerald-200 ring-inset dark:bg-emerald-950 dark:text-emerald-200 dark:ring-emerald-800">
          {t('asset.nominatedForYou')}
        </p>
      ) : null}
      {asset.status === 'available' || nominatedForMe ? (
        <PriceConfigurator locale={locale} assetIds={[asset.id]} personaId={persona} asOf={asOf} />
      ) : (
        <p className="mt-8 rounded-xl border border-dashed border-stone-300 p-6 text-stone-700 dark:border-stone-700 dark:text-stone-300">
          {t('asset.notAvailable')}
        </p>
      )}
    </div>
  );
}

function AssetFact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-stone-600 dark:text-stone-400">{label}</dt>
      <dd className="text-base font-medium">{value}</dd>
    </div>
  );
}
