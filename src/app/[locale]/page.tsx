// The catalogue: every asset, grouped by category, with today's net list price.
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { AssetCard } from '@/components/asset-card';
import { HeroLoop } from '@/components/ui/hero-loop';
import { SwipeRow } from '@/components/ui/swipe-row';
import { loadPriceLists } from '@/data/load';
import { assetCategorySchema } from '@/data/schemas';
import { listPriceOn } from '@/domain/price-list';
import { withListedPrices } from '@/domain/second-life';
import { formatIsoDate, formatNumber } from '@/i18n/format';
import { getT } from '@/i18n/get-t';
import { isLocale } from '@/i18n/locales';
import { listAssets } from '@/server/assets';
import { db } from '@/server/db';
import { asOfDate } from '@/server/as-of';
import { listedPrices } from '@/server/listed-prices';

export default async function CataloguePage({ params }: PageProps<'/[locale]'>) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();

  // Render on every request: prices depend on today's date and on the database.
  await connection();

  const t = getT(locale);
  const today = await asOfDate(); // the demo date or the real one (D-030); domain code never reads the clock
  const [assets, dataPriceLists] = await Promise.all([listAssets(db), loadPriceLists()]);
  // Re-listed items show their second-life price, not the new-item price (D-035).
  const listed = await listedPrices(db);
  const priceLists = withListedPrices(dataPriceLists, listed);
  const groups = assetCategorySchema.options
    .map((category) => ({ category, assets: assets.filter((a) => a.category === category) }))
    .filter((group) => group.assets.length > 0);

  const secondLife = assets.filter((a) => a.previous_lives > 0).length;
  const first = groups[0];

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-12 px-4 py-6 sm:gap-16 sm:px-6 sm:py-10">
      <section
        aria-labelledby="catalogue-title"
        className="relative overflow-hidden rounded-xl bg-stage px-6 py-10 text-stage-fg sm:px-12 sm:py-16"
      >
        <HeroLoop />
        <div className="relative flex max-w-2xl flex-col items-start gap-5">
          <p className="rounded-full bg-stage-accent px-3 py-1 text-xs font-semibold text-[#1a0d08]">
            <time dateTime={today}>
              {t('catalogue.pricesOn', { date: formatIsoDate(today, locale) })}
            </time>
          </p>
          <h1
            id="catalogue-title"
            className="font-display text-3xl leading-[1.02] font-extrabold tracking-tight text-balance uppercase sm:text-5xl"
          >
            {t('catalogue.heroTitle')}
          </h1>
          <p className="max-w-xl text-base text-stage-muted sm:text-lg">{t('catalogue.intro')}</p>
          {first ? (
            <a
              href={`#row-category-${first.category}`}
              className="btn-primary bg-stage-accent text-[#1a0d08] hover:bg-[#ff9677]"
            >
              {t('catalogue.browse')}
              <span aria-hidden="true">↓</span>
            </a>
          ) : null}
          <dl className="mt-4 flex flex-wrap gap-x-8 gap-y-2 font-display text-xs tracking-wide uppercase">
            <Stat label={t('catalogue.statItems')} value={formatNumber(assets.length, locale)} />
            <Stat label={t('catalogue.statSecondLife')} value={formatNumber(secondLife, locale)} />
            <Stat
              label={t('catalogue.statCategories')}
              value={formatNumber(groups.length, locale)}
            />
          </dl>
        </div>
      </section>

      {groups.length === 0 ? (
        <p className="rounded-lg border border-dashed border-line p-6 text-muted">
          {t('catalogue.empty')}
        </p>
      ) : null}

      {groups.map((group) => {
        const title = t(`category.${group.category}`);
        return (
          <SwipeRow
            key={group.category}
            headingId={`category-${group.category}`}
            title={title}
            subtitle={t('catalogue.itemCount', { count: group.assets.length })}
            previousLabel={t('catalogue.scrollBack', { category: title })}
            nextLabel={t('catalogue.scrollForward', { category: title })}
          >
            {group.assets.map((asset) => (
              <li key={asset.id} className="snap-start">
                <AssetCard
                  asset={asset}
                  price={listPriceOn(priceLists, asset.id, today)}
                  secondLifePrice={asset.id in listed}
                  locale={locale}
                  t={t}
                />
              </li>
            ))}
          </SwipeRow>
        );
      })}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-2">
      <dt className="order-2 text-stage-muted">{label}</dt>
      <dd className="order-1 text-lg font-bold text-stage-accent">{value}</dd>
    </div>
  );
}
