// The catalogue: what can be leased today, one card per model, filtered in the URL. The
// category is the first choice (`?category=e_bike`); under it, the secondary filters narrow
// that category only (condition, brand, sort) and a new category starts them afresh. Prices are
// on the demo clock's day; each card's price is its model's offer at 36 months with nothing
// down (pricing's financeOffer), the lowest of its versions when they differ.
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import type { ReactNode } from 'react';
import { ModelCard, UnavailableCard } from '@/components/model-card';
import { Notice, cx } from '@/components/ui';
import { assetCategorySchema } from '@/data/schemas';
import {
  brandsIn,
  buildCatalogue,
  catalogueSorts,
  DEFAULT_SORT,
  conditionFilters,
  parseCatalogueFilters,
  type CatalogueEntry,
  unavailableUnits,
  type CatalogueFilters,
} from '@/domain/catalogue/catalogue';
import { allowedTermsOf, financeOffer, termsOf, type FinanceOffer } from '@/domain/pricing';
import { formatNumber } from '@/i18n/format';
import { getT } from '@/i18n/get-t';
import { isLocale, type Locale } from '@/i18n/locales';
import { ADMIN_ACTOR, readActor } from '@/server/actor';
import { listAssetsWithLives } from '@/server/asset-lives';
import { db } from '@/server/db';
import { todayForRequest } from '@/server/demo-clock';
import { loadPricingData } from '@/server/quotes';

const CARD_TERM = 36;
const NO_FILTERS: CatalogueFilters = {
  category: null,
  condition: null,
  make: null,
  sort: DEFAULT_SORT,
};

/** The plain monthly price a card shows: with the down payment it needs, or none at all. */
function monthlyOf(offer: FinanceOffer): number | null {
  return offer.kind === 'standard' || offer.kind === 'needs_down_payment'
    ? offer.quote.monthlyGrossCents
    : null;
}

function catalogueHref(locale: Locale, filters: CatalogueFilters): string {
  const query = new URLSearchParams();
  if (filters.category) query.set('category', filters.category);
  if (filters.condition) query.set('condition', filters.condition);
  if (filters.category && filters.make) query.set('brand', filters.make);
  if (filters.sort !== DEFAULT_SORT) query.set('sort', filters.sort);
  const text = query.toString();
  return `/${locale}/catalogue${text ? `?${text}` : ''}`;
}

export default async function CataloguePage({
  params,
  searchParams,
}: PageProps<'/[locale]/catalogue'>) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();

  // Render on every request: prices depend on today's date and on the database.
  await connection();

  const t = getT(locale);
  const today = await todayForRequest(); // read once here; domain code never reads the clock
  const [assets, data, actor] = await Promise.all([
    listAssetsWithLives(db),
    loadPricingData(),
    readActor(db),
  ]);
  const termMonths = termsOf(data.table).includes(CARD_TERM) ? CARD_TERM : termsOf(data.table)[0]!;
  // Each item is priced at the catalogue's term when its category allows it, else at the longest
  // term it may be offered (D43), so a category capped below the default still shows a price. An
  // item with no allowed term is priced at the default and the offer carries the refusal.
  const termOf = (assetId: string): number => {
    const allowed = allowedTermsOf(data, assetId);
    return allowed.includes(termMonths) ? termMonths : (allowed[allowed.length - 1] ?? termMonths);
  };
  const offers = new Map(
    assets.map((asset) => [
      asset.id,
      financeOffer(data, { assetId: asset.id, termMonths: termOf(asset.id), isoDate: today }),
    ])
  );
  const entries: CatalogueEntry[] = assets.map((asset) => ({
    asset,
    monthlyCents: monthlyOf(offers.get(asset.id)!),
  }));

  const filters = parseCatalogueFilters(await searchParams);
  const groups = buildCatalogue(entries, filters);
  // Returned and leased units come last, one by one and greyed out, so their pages and
  // passports stay one click away (D42, revised).
  const unavailable = unavailableUnits(entries, filters);
  const categories = [
    { key: null, label: t('catalogue.filter.all') },
    ...assetCategorySchema.options.map((category) => ({
      key: category,
      label: t(`category.${category}`),
    })),
  ].map((c) => ({
    ...c,
    count:
      buildCatalogue(entries, { ...NO_FILTERS, category: c.key }).length +
      unavailableUnits(entries, { ...NO_FILTERS, category: c.key }).length,
  }));
  const brands = filters.category ? brandsIn(entries, filters.category) : [];
  const refined =
    filters.condition !== null || filters.make !== null || filters.sort !== DEFAULT_SORT;

  return (
    <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
      <h1 className="text-5xl sm:text-6xl">{t('catalogue.title')}</h1>
      <p className="mt-2 text-lg text-ink-muted">
        {t('catalogue.priceNote', { months: termMonths })}
      </p>

      <nav aria-label={t('catalogue.filter.label')} className="mt-8">
        <ul className="flex flex-wrap gap-2">
          {categories.map((category) => {
            const active = category.key === filters.category;
            return (
              <li key={category.key ?? 'all'}>
                <Link
                  // A new category starts its secondary filters afresh.
                  href={catalogueHref(locale, { ...NO_FILTERS, category: category.key })}
                  aria-current={active ? 'page' : undefined}
                  className={cx(
                    'inline-flex min-h-11 items-center gap-2 rounded-full border-2 px-4 font-bold transition-colors',
                    active
                      ? 'border-brand bg-brand text-brand-contrast'
                      : 'border-line-strong text-ink hover:border-brand'
                  )}
                >
                  {category.label}
                  <span
                    className={cx(
                      'rounded-full px-2 text-xs tabular-nums',
                      active ? 'bg-brand-contrast text-brand-text' : 'bg-muted'
                    )}
                  >
                    {formatNumber(category.count, locale)}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <nav
        aria-label={t('catalogue.filter.refine')}
        className="mt-4 divide-y divide-line rounded-xl border border-line bg-raised px-4"
      >
        <ChipGroup
          label={t('catalogue.filter.condition')}
          chips={[null, ...conditionFilters].map((condition) => ({
            key: condition ?? 'any',
            label: condition ? t(`catalogue.filter.${condition}`) : t('catalogue.filter.any'),
            href: catalogueHref(locale, { ...filters, condition }),
            active: filters.condition === condition,
          }))}
          // "Clear filters" sits at the end of the first row, not on a row of its own.
          aside={
            refined ? (
              <Link
                href={catalogueHref(locale, { ...NO_FILTERS, category: filters.category })}
                className="text-sm font-bold whitespace-nowrap text-brand-text underline decoration-2 underline-offset-4"
              >
                {t('catalogue.filter.clear')}
              </Link>
            ) : null
          }
        />
        {brands.length > 1 ? (
          <ChipGroup
            label={t('catalogue.filter.brand')}
            chips={[null, ...brands].map((make) => ({
              key: make ?? 'all',
              label: make ?? t('catalogue.filter.allBrands'),
              href: catalogueHref(locale, { ...filters, make }),
              active: filters.make === make,
            }))}
          />
        ) : null}
        <ChipGroup
          label={t('catalogue.filter.sort')}
          chips={catalogueSorts.map((sort) => ({
            key: sort,
            label: t(`catalogue.sort.${sort}`),
            href: catalogueHref(locale, { ...filters, sort }),
            active: filters.sort === sort,
          }))}
        />
      </nav>

      {groups.length === 0 && unavailable.length === 0 ? (
        <Notice tone="info" className="mt-8">
          {assets.length === 0 ? t('catalogue.empty') : t('catalogue.noMatch')}
        </Notice>
      ) : (
        <ul className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {groups.map((group) => (
            <li key={group.key}>
              <ModelCard
                group={group}
                offer={offers.get(group.versions[0]!.asset.id)!}
                termMonths={termOf(group.versions[0]!.asset.id)}
                locale={locale}
                t={t}
              />
            </li>
          ))}
          {unavailable.map((asset) => (
            <li key={asset.id}>
              <UnavailableCard
                asset={asset}
                locale={locale}
                t={t}
                isAdmin={actor === ADMIN_ACTOR}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

type Chip = { key: string; label: string; href: string; active: boolean };

/**
 * One secondary filter on a row of its own: its name in a fixed column, then its small links,
 * the current one filled. A row per filter keeps one filter's last chip from running into the
 * next filter's name.
 */
function ChipGroup({ label, chips, aside }: { label: string; chips: Chip[]; aside?: ReactNode }) {
  return (
    <div className="grid gap-2 py-3 sm:grid-cols-[7rem_minmax(0,1fr)_auto] sm:items-center">
      {/* On a phone the label and the aside share the first line; from sm they are the
          first and last columns, with the chips between them. */}
      <div className="flex items-center justify-between gap-3 sm:contents">
        <span className="text-sm font-bold text-ink-muted sm:col-start-1 sm:row-start-1">
          {label}
        </span>
        {aside ? <span className="sm:col-start-3 sm:row-start-1">{aside}</span> : null}
      </div>
      <ul className="flex flex-wrap gap-1.5 sm:col-start-2 sm:row-start-1">
        {chips.map((chip) => (
          <li key={chip.key}>
            <Link
              href={chip.href}
              aria-current={chip.active ? 'true' : undefined}
              scroll={false}
              className={cx(
                'inline-flex min-h-9 items-center rounded-full border px-3 text-sm font-semibold transition-colors',
                chip.active
                  ? 'border-brand bg-brand-soft text-brand-text'
                  : 'border-line-strong text-ink hover:border-brand'
              )}
            >
              {chip.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
