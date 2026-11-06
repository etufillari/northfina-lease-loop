// The price page: one asset, the sliders with the live breakdown and the term comparison, and,
// with `?quote=<id>`, the stored quote locked at its date and list version (D7, card 2).
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { QuoteBreakdownList } from '@/components/quote-breakdown';
import { PassportCard } from '@/components/passport-card';
import { ItemArt } from '@/components/item-art';
import { QuoteCalculator } from '@/components/quote-calculator';
import { VersionPicker } from '@/components/version-picker';
import {
  Badge,
  Card,
  DefinitionList,
  LifeStamp,
  LinkButton,
  Money,
  Notice,
  PriceTag,
} from '@/components/ui';
import { modelVersions } from '@/domain/catalogue/catalogue';
import { formatEuro } from '@/domain/money';
import { termControl } from '@/components/quote-terms';
import {
  allowedTermsOf,
  financeOffer,
  termsOf,
  type FinanceOffer,
  type QuoteStatus,
} from '@/domain/pricing';
import { listPriceOn } from '@/domain/price-list';
import { formatIsoDate, formatNumber } from '@/i18n/format';
import { getT, type Translate } from '@/i18n/get-t';
import { intlLocale, isLocale, type Locale } from '@/i18n/locales';
import { ADMIN_ACTOR, readActor } from '@/server/actor';
import { listAssetsWithLives } from '@/server/asset-lives';
import { db } from '@/server/db';
import { todayForRequest } from '@/server/demo-clock';
import {
  getQuote,
  loadPricingData,
  previewQuote,
  storedQuoteStatusOn,
  type StoredQuote,
} from '@/server/quotes';
import { latestAssessment } from '@/server/second-life';
import { pricingForAsset } from '@/server/second-life-price';

const DEFAULT_TERM = 36;

/** A whole number from a search param, kept within [min, max]; `fallback` if absent or broken. */
function clampInt(raw: string | string[] | undefined, min: number, max: number, fallback: number) {
  const value = typeof raw === 'string' ? Number.parseInt(raw, 10) : Number.NaN;
  return Number.isSafeInteger(value) ? Math.min(max, Math.max(min, value)) : fallback;
}

export default async function PricePage({
  params,
  searchParams,
}: PageProps<'/[locale]/assets/[id]'>) {
  const { locale, id } = await params;
  if (!isLocale(locale)) notFound();
  await connection(); // prices depend on today and the database

  const t = getT(locale);
  const today = await todayForRequest(); // read once here, passed down
  const [assets, listData, actor] = await Promise.all([
    listAssetsWithLives(db),
    loadPricingData(),
    readActor(db),
  ]);
  const asset = assets.find((a) => a.id === id);
  if (!asset) notFound();
  // D12: a relisted item is priced on its assessment's second-life amount, here as in the quote.
  const [data, secondLife] = await Promise.all([
    pricingForAsset(db, asset.id, listData),
    latestAssessment(db, asset.id),
  ]);

  const query = await searchParams;
  const quoteParam = query.quote;
  const quoteId = typeof quoteParam === 'string' ? quoteParam : undefined;
  const stored = quoteId ? await getQuote(db, quoteId) : null;
  const storedForAsset = stored && stored.breakdown.assetId === asset.id ? stored : null;

  const price = listPriceOn(data.priceLists, asset.id, today);
  // The terms this item may be offered: the table's, under its category's cap (D43). The
  // default term is picked from them, so the offer and the versions never price over the cap.
  const terms = allowedTermsOf(data, asset.id);
  const termMonths = terms.includes(DEFAULT_TERM) ? DEFAULT_TERM : (terms[0] ?? DEFAULT_TERM);
  // The note names the longest term the item may be offered, as the refusal does.
  const termNote =
    terms.length > 0 && terms.length < termsOf(data.table).length
      ? t('pricing.calculator.termCap', {
          category: t(`category.${asset.category}`),
          months: terms[terms.length - 1]!,
        })
      : undefined;
  // How the item can be financed at the default term: an item that needs a down payment opens
  // set up that way, one below the smallest amount says it is not leasable on this list (D78).
  const offer = financeOffer(data, { assetId: asset.id, termMonths, isoDate: today });
  // ?down= overrides the preset; an out-of-range value is clamped, a missing or broken one
  // falls back to the offer's.
  const initial = {
    termMonths,
    downPaymentCents: price.ok
      ? clampInt(
          query.down,
          0,
          price.priceCents - 1,
          offer.kind === 'needs_down_payment' ? offer.downPaymentCents : 0
        )
      : 0,
  };
  // The model's other versions (new and used), priced like the catalogue's cards.
  const versions = modelVersions(
    assets.map((a) => {
      const o = financeOffer(data, { assetId: a.id, termMonths, isoDate: today });
      return {
        asset: a,
        monthlyCents:
          o.kind === 'standard' || o.kind === 'needs_down_payment'
            ? o.quote.monthlyGrossCents
            : null,
      };
    }),
    asset.id
  );

  const facts = [
    { label: t('condition.label'), value: t(`condition.${asset.condition}`) },
    {
      label: t('asset.usage'),
      value: t(`usage.${asset.usage.unit}`, { value: formatNumber(asset.usage.value, locale) }),
    },
    { label: t('asset.modelYear'), value: String(asset.model_year) },
    { label: t('passport.serial'), value: asset.serial_number },
    {
      label: t('pricing.page.pricesOn'),
      value: <time dateTime={today}>{formatIsoDate(today, locale)}</time>,
    },
  ];

  const item = (
    <div>
      <Link
        href={`/${locale}/catalogue`}
        className="inline-flex items-center gap-1 rounded font-bold underline decoration-brand/30 decoration-2 underline-offset-4 hover:decoration-brand"
      >
        <span aria-hidden="true">←</span>
        {t('catalogue.title')}
      </Link>
      <p className="mt-6 text-xs font-extrabold tracking-[0.14em] text-accent-ink uppercase">
        {asset.make} · {t(`category.${asset.category}`)}
      </p>
      <div className="mt-2 flex items-start justify-between gap-4">
        <h1 className="text-4xl leading-tight text-balance sm:text-5xl">{asset.model}</h1>
        <LifeStamp
          size="lg"
          life={t('stamp.life', { n: asset.previous_lives + 1 })}
          note={asset.previous_lives === 0 ? t('stamp.new') : t('stamp.checked')}
          later={asset.previous_lives > 0}
        />
      </div>
      <p className="mt-3 max-w-xl text-lg text-ink-muted">{t('pricing.page.intro')}</p>
      {asset.status !== 'available' ? (
        <Badge status={asset.status} srPrefix={t('status.label')} className="mt-4">
          {t(`status.${asset.status}`)}
        </Badge>
      ) : null}
      {secondLife && asset.status === 'available' ? (
        <Notice tone="info" className="mt-6">
          {t('secondLife.priceNote', {
            price: formatEuro(secondLife.match.relist.secondLifeFinancedCents, intlLocale[locale]),
            date: formatIsoDate(secondLife.assessedOn, locale),
          })}
        </Notice>
      ) : null}
      <OfferNotice offer={offer} locale={locale} t={t} />
      {versions.length > 1 ? (
        <VersionPicker versions={versions} currentId={asset.id} locale={locale} t={t} />
      ) : null}

      <div className="mt-8 rounded-xl bg-muted px-8 pt-10 pb-4">
        <ItemArt category={asset.category} model={asset.model} className="mx-auto max-w-md" />
      </div>

      <dl className="mt-8">
        {facts.map((fact) => (
          <div
            key={fact.label}
            className="rule-dashed flex justify-between gap-4 border-b-2 py-3 first:border-t-2"
          >
            <dt className="text-ink-muted">{fact.label}</dt>
            <dd className="text-right font-bold">{fact.value}</dd>
          </div>
        ))}
      </dl>
      <PassportCard
        locale={locale}
        assetId={asset.id}
        title={t('passport.cardTitle')}
        text={t('passport.cardText')}
        className="mt-6"
      />
      {/* D85: the second life is back office, linked for the admin only. */}
      {actor === ADMIN_ACTOR && (asset.status === 'returned' || secondLife) ? (
        <Link
          href={`/${locale}/assets/${encodeURIComponent(asset.id)}/second-life`}
          className="mt-4 inline-block rounded font-bold text-brand-text underline decoration-2 underline-offset-4"
        >
          {t('secondLife.link')}
        </Link>
      ) : null}
    </div>
  );

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
      {quoteId && !storedForAsset ? (
        <Notice tone="warning" className="mb-8">
          {t('quote.notFound')}
        </Notice>
      ) : null}

      {price.ok && termControl(terms) !== 'none' ? (
        <QuoteCalculator
          assetId={asset.id}
          locale={locale}
          terms={terms}
          termNote={termNote}
          unitPriceCents={price.priceCents}
          initial={initial}
          initialPreview={previewQuote(data, { assetId: asset.id, ...initial, today })}
          canQuote={asset.status === 'available'}
        >
          {item}
        </QuoteCalculator>
      ) : (
        <>
          {item}
          <Notice tone="warning" className="mt-8">
            {price.ok
              ? t('pricing.noTermsForCategory', { category: t(`category.${asset.category}`) })
              : t('asset.noPrice')}
          </Notice>
        </>
      )}

      {/* After the item, so the page's h1 (the model) comes before the quote's h2. */}
      <div className="mt-12">
        {storedForAsset ? (
          <StoredQuoteSection
            quote={storedForAsset}
            status={storedQuoteStatusOn(storedForAsset, today, data.priceLists)}
            locale={locale}
            t={t}
          />
        ) : null}
      </div>
    </div>
  );
}

/** Why the price below is set up with a down payment, or why the item cannot be leased (D78). */
function OfferNotice({ offer, locale, t }: { offer: FinanceOffer; locale: Locale; t: Translate }) {
  const euro = (cents: number) => formatEuro(cents, intlLocale[locale]);
  if (offer.kind === 'none' && offer.reason.code === 'below_minimum') {
    const { financedCents, minimumCents } = offer.reason.params;
    return (
      <Notice tone="warning" className="mt-6" title={t('asset.offer.belowMinimumTitle')}>
        {t('asset.offer.belowMinimumBody', {
          priceCents: euro(financedCents),
          minimumCents: euro(minimumCents),
        })}
      </Notice>
    );
  }
  if (offer.kind === 'needs_down_payment') {
    const { downPaymentCents, quote } = offer;
    return (
      <Notice
        tone="info"
        className="mt-6"
        title={t('asset.offer.downTitle', { downPaymentCents: euro(downPaymentCents) })}
      >
        {t('asset.offer.downBody', {
          priceCents: euro(quote.listPriceCents),
          // The offer leaves exactly the largest amount to finance.
          maximumCents: euro(quote.financedCents),
        })}
      </Notice>
    );
  }
  return null;
}

function StoredQuoteSection({
  quote,
  status,
  locale,
  t,
}: {
  quote: StoredQuote;
  status: QuoteStatus;
  locale: Locale;
  t: Translate;
}) {
  const b = quote.breakdown;
  return (
    <Card
      as="section"
      id="quote"
      title={t('quote.title')}
      titleId="quote-title"
      className="scroll-mt-6"
    >
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Badge status={status.status === 'valid' ? 'quoted' : 'expired'}>
          {t(`quote.status.${status.status}`)}
        </Badge>
        <span className="text-sm text-ink-muted">
          {t('quote.reference', { id: quote.id.slice(0, 8) })}
        </span>
      </div>
      <PriceTag
        className="mb-6 max-w-xl"
        label={t('quote.tagLabel')}
        amount={<Money cents={b.monthlyGrossCents} locale={locale} />}
        sub={t('quote.tagSub', {
          months: b.termMonths,
          version: b.priceListVersion,
          date: formatIsoDate(quote.quoteDate, locale),
        })}
        lines={[
          {
            label: t('pricing.line.totalIfReturn'),
            value: <Money cents={b.totalIfReturnCents} locale={locale} />,
          },
          {
            label: t('pricing.line.totalIfBuy'),
            value: <Money cents={b.totalIfBuyCents} locale={locale} />,
          },
        ]}
      />
      <DefinitionList
        variant="grid"
        className="mb-6"
        items={[
          { label: t('quote.date'), value: formatIsoDate(quote.quoteDate, locale) },
          {
            label: t('quote.listVersion'),
            value: t('quote.listVersionValue', { version: b.priceListVersion }),
          },
          { label: t('quote.validUntil'), value: formatIsoDate(quote.validUntil, locale) },
          { label: t('quote.term'), value: t('pricing.months', { months: b.termMonths }) },
        ]}
      />

      <Notice tone="info" className="mb-4">
        {t('quote.locked', {
          version: b.priceListVersion,
          date: formatIsoDate(quote.quoteDate, locale),
        })}
      </Notice>
      {status.cheaperListLive && status.todayList ? (
        <Notice tone="success" title={t('quote.cheaper.title')} className="mb-4">
          <p>
            {t('quote.cheaper.body', { version: status.todayList.version })}{' '}
            <Money cents={status.todayList.unitPriceCents} locale={locale} />
          </p>
          <LinkButton
            href={`/${locale}/assets/${b.assetId}`}
            variant="secondary"
            size="sm"
            className="mt-3"
          >
            {t('quote.cheaper.action')}
          </LinkButton>
        </Notice>
      ) : null}
      {status.status === 'expired' ? (
        <Notice tone="warning" className="mb-4">
          {t('quote.expiredNotice')}
        </Notice>
      ) : null}

      <QuoteBreakdownList quote={b} locale={locale} t={t} />

      {status.status === 'valid' ? (
        <LinkButton
          href={`/${locale}/apply/${quote.id}`}
          size="lg"
          className="mt-6 w-full sm:w-auto"
        >
          {t('quote.apply')}
        </LinkButton>
      ) : null}
    </Card>
  );
}
