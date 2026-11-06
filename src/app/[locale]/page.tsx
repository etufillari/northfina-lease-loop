// The catalogue: every asset, grouped by category, with today's net list price.
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import Link from 'next/link';
import { InfinityHero } from '@/components/infinity-hero';
import { AssetCard } from '@/components/asset-card';
import { UiIcon } from '@/components/ui-icon';
import { loadPriceLists, loadVatRates } from '@/data/load';
import { assetCategorySchema } from '@/data/schemas';
import { assetOfferPrice } from '@/domain/asset-offer';
import { formatIsoDate } from '@/i18n/format';
import { getT } from '@/i18n/get-t';
import { isLocale } from '@/i18n/locales';
import { toAsset } from '@/server/assets';
import { db } from '@/server/db';
import { appToday, demoModeEnabled } from '@/server/demo-mode';

export default async function CataloguePage({ params }: PageProps<'/[locale]'>) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();

  // Render on every request: prices depend on today's date and on the database.
  await connection();

  const t = getT(locale);
  const today = await appToday(); // the page decides what "today" is; domain code never reads the clock
  const [rows, priceLists, vat] = await Promise.all([
    db.asset.findMany({
      where: {
        status: 'available',
        isFleetHistory: false,
        contracts: { none: { status: 'active' } },
      },
      orderBy: { id: 'asc' },
    }),
    loadPriceLists(),
    loadVatRates(),
  ]);
  const assets = rows.map(toAsset);
  const rowById = new Map(rows.map((row) => [row.id, row]));
  const rate = vat.rates.find(
    (rate) => rate.valid_from <= today && (rate.valid_to === null || rate.valid_to >= today)
  );
  const vatBasisPoints = rate ? Math.round(rate.rate_percent * 100) : null;
  const groups = assetCategorySchema.options
    .map((category) => ({ category, assets: assets.filter((a) => a.category === category) }))
    .filter((group) => group.assets.length > 0);

  return (
    <div className="mx-auto w-full max-w-[1200px] px-4 py-10 sm:px-6 tablet:py-14">
      <InfinityHero pauseLabel={t('catalogue.pauseMotion')} playLabel={t('catalogue.playMotion')}>
        <h1 className="text-balance font-display text-[clamp(2.5rem,5.5vw,4.75rem)] leading-[1.06] font-semibold tracking-[-0.045em]">
          <span className="block">{t('catalogue.heroLead')}</span>
          <span className="mt-2 block text-primary">{t('catalogue.heroAccent')}</span>
        </h1>
        <p className="mx-auto mt-7 max-w-[36ch] text-body text-ink-muted sm:text-[20px]">
          {t('catalogue.intro')}
        </p>
        <Link
          href="#catalogue"
          className="pressable mt-8 inline-flex min-h-target items-center gap-4 rounded-pill bg-primary px-7 py-4 text-caption font-semibold text-white"
        >
          {t('dashboard.browse')}
          <UiIcon name="arrow" className="size-4" />
        </Link>
      </InfinityHero>
      <div
        id="catalogue"
        className="mt-12 flex scroll-mt-4 flex-wrap items-center justify-between gap-x-6 gap-y-2 border-b border-divider pb-5"
      >
        <p className="text-caption text-ink-muted">
          <time dateTime={today}>
            {t('catalogue.pricesOn', { date: formatIsoDate(today, locale) })}
          </time>
        </p>
        <p className="text-fine text-ink-muted">
          {t('catalogue.photosIllustrative')}{' '}
          <Link
            href={`/${locale}/photo-credits`}
            className="text-primary underline underline-offset-2"
          >
            {t('catalogue.photoCredits')}
          </Link>
        </p>
      </div>

      {groups.length === 0 ? (
        <p className="mt-12 text-body text-ink-muted">{t('catalogue.empty')}</p>
      ) : null}

      {groups.map((group) => (
        <section
          key={group.category}
          aria-labelledby={`category-${group.category}`}
          className="mt-12"
        >
          <h2
            id={`category-${group.category}`}
            className="scroll-mt-4 font-display text-tagline font-semibold"
          >
            {t(`category.${group.category}`)}
          </h2>
          <ul className="mt-6 grid gap-x-5 gap-y-10 min-[30rem]:grid-cols-2 tablet:grid-cols-3 desktop:grid-cols-4">
            {group.assets.map((asset) => (
              <li key={asset.id}>
                <AssetCard
                  showId={demoModeEnabled()}
                  asset={asset}
                  price={assetOfferPrice(rowById.get(asset.id)!, priceLists, today)}
                  vatBasisPoints={vatBasisPoints}
                  locale={locale}
                  t={t}
                />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
