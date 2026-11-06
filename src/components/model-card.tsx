// One model in the catalogue: its drawing with the life stamp of its first version, the make
// and model, what is on offer (one unit's condition, wear and year, or "new and used · 3
// available"), and the monthly price on a small tag: one price, the lowest of a range, or
// "See details" for an item with no plain price ("Not leasable on this price list" below the
// smallest lease, D78). The card links to the first version's page, where the customer picks
// between versions.
// A server component: it renders to HTML and ships no JavaScript. The whole card is one link
// (the title's link stretches over it), so there is one tab stop per model.
import Link from 'next/link';
import type { Asset } from '@/data/schemas';
import type { ModelGroup } from '@/domain/catalogue/catalogue';
import { formatEuro } from '@/domain/money';
import type { FinanceOffer } from '@/domain/pricing';
import { formatNumber } from '@/i18n/format';
import type { Translate } from '@/i18n/get-t';
import { intlLocale, type Locale } from '@/i18n/locales';
import { ItemArt } from './item-art';
import { Badge, LifeStamp, Money, PriceTag } from './ui';

type ModelCardProps = {
  group: ModelGroup;
  /** The offer of the version the card links to, for the line under the price. */
  offer: FinanceOffer;
  termMonths: number;
  locale: Locale;
  t: Translate;
};

export function ModelCard({ group, offer, termMonths, locale, t }: ModelCardProps) {
  const first = group.versions[0]!.asset;
  const headingId = `model-${first.id}`;
  const facts =
    group.versions.length === 1
      ? [
          t(`condition.${first.condition}`),
          t(`usage.${first.usage.unit}`, { value: formatNumber(first.usage.value, locale) }),
          String(first.model_year),
        ]
      : [
          group.hasNew && group.hasUsed
            ? t('catalogue.card.newAndUsed')
            : t(`condition.${first.condition}`),
        ];
  if (group.count > 1) {
    facts.push(t('catalogue.card.inStock', { count: formatNumber(group.count, locale) }));
  }

  const priced = group.minMonthlyCents !== null;
  const range = priced && group.minMonthlyCents !== group.maxMonthlyCents;
  const sub =
    offer.kind === 'none' && offer.reason.code === 'below_minimum'
      ? t('catalogue.card.belowMinimum')
      : !priced
        ? undefined
        : offer.kind === 'needs_down_payment' && group.versions.length === 1
          ? t('catalogue.card.withDown', {
              down: formatEuro(offer.downPaymentCents, intlLocale[locale]),
              months: termMonths,
            })
          : t('catalogue.card.terms', { months: termMonths });

  return (
    <article
      aria-labelledby={headingId}
      className="group relative flex h-full flex-col rounded-xl border border-line bg-raised p-3 shadow-item transition-transform focus-within:-translate-y-0.5 hover:-translate-y-0.5"
    >
      <div className="relative rounded-lg bg-muted px-6 pt-8 pb-2">
        <ItemArt category={group.category} model={group.model} />
        <LifeStamp
          life={t('stamp.life', { n: first.previous_lives + 1 })}
          note={first.previous_lives === 0 ? t('stamp.new') : t('stamp.checked')}
          later={first.previous_lives > 0}
          className="absolute top-3 left-3"
        />
      </div>

      <div className="flex flex-1 flex-col px-2 pt-4 pb-2">
        <p className="text-xs font-extrabold tracking-[0.14em] text-accent-ink uppercase">
          {group.make}
        </p>
        <h3 id={headingId} className="mt-1 text-xl leading-snug">
          <Link
            href={`/${locale}/assets/${first.id}`}
            className="rounded after:absolute after:inset-0 after:rounded-xl after:content-['']"
          >
            {group.model}
          </Link>
        </h3>
        <p className="mt-1 text-sm text-ink-muted">{facts.join(' · ')}</p>

        <div className="mt-auto pt-5">
          <PriceTag
            size="sm"
            className="w-fit min-w-44"
            label={range ? t('catalogue.card.from') : t('catalogue.card.monthly')}
            amount={
              priced ? (
                <Money cents={group.minMonthlyCents!} locale={locale} />
              ) : (
                <span className="text-2xl">{t('catalogue.card.seeDetails')}</span>
              )
            }
            sub={sub}
          />
        </div>
      </div>
    </article>
  );
}

type UnavailableCardProps = {
  asset: Asset;
  locale: Locale;
  t: Translate;
  /** D85: the second-life link is back office, shown to the admin only. */
  isAdmin: boolean;
};

/**
 * A returned or leased unit at the bottom of the catalogue: greyed out under its status, with
 * no price (a returned unit is re-priced before its next life; a leased one belongs to
 * someone). It links straight to its passport: its lives and the CO2 they saved. A returned
 * unit also links the admin to its second life, where it is assessed and matched to the
 * waiting list (D85: back office).
 */
export function UnavailableCard({ asset, locale, t, isAdmin }: UnavailableCardProps) {
  const headingId = `unit-${asset.id}`;
  return (
    <article
      aria-labelledby={headingId}
      className="group relative flex h-full flex-col rounded-xl border border-line bg-raised p-3"
    >
      <div className="relative rounded-lg bg-muted px-6 pt-8 pb-2">
        <div className="opacity-40 grayscale">
          <ItemArt category={asset.category} model={asset.model} />
        </div>
        <Badge
          status={asset.status}
          srPrefix={t('status.label')}
          className="absolute top-3 right-3"
        >
          {t(`status.${asset.status}`)}
        </Badge>
      </div>
      <div className="flex flex-1 flex-col px-2 pt-4 pb-2 text-ink-muted">
        <p className="text-xs font-extrabold tracking-[0.14em] uppercase">{asset.make}</p>
        <h3 id={headingId} className="mt-1 text-xl leading-snug text-ink">
          <Link
            href={`/${locale}/assets/${asset.id}/passport`}
            className="rounded after:absolute after:inset-0 after:rounded-xl after:content-['']"
          >
            {asset.model}
          </Link>
        </h3>
        <p className="mt-1 text-sm">
          {[
            t(`condition.${asset.condition}`),
            t(`usage.${asset.usage.unit}`, { value: formatNumber(asset.usage.value, locale) }),
            String(asset.model_year),
          ].join(' · ')}
        </p>
        <div className="mt-auto pt-5">
          <p className="rounded-lg bg-muted px-4 py-3 text-sm">
            <span className="block font-semibold">{t('catalogue.card.unavailable')}</span>
            <span className="block text-brand-text underline decoration-2 underline-offset-4">
              {t('catalogue.card.unavailableHint')}
            </span>
          </p>
          {isAdmin && asset.status === 'returned' ? (
            // Above the card's stretched passport link, so it takes its own clicks.
            <Link
              href={`/${locale}/assets/${encodeURIComponent(asset.id)}/second-life`}
              className="relative z-10 mt-3 inline-block rounded text-sm font-bold text-brand-text underline decoration-2 underline-offset-4"
            >
              {t('secondLife.link')}
            </Link>
          ) : null}
        </div>
      </div>
    </article>
  );
}
