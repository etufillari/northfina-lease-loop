// Shown where the calculator would be when an item can't be leased today: why, then a few similar
// items that can be (chosen by `similarAvailable`), so the page never ends in a dead end.
import Link from 'next/link';
import type { Asset } from '@/data/schemas';
import { formatEuro } from '@/domain/money';
import type { ListPriceResult } from '@/domain/price-list';
import type { Translate } from '@/i18n/get-t';
import { intlLocale, type Locale } from '@/i18n/locales';
import { CategoryArt } from './ui/category-art';

type UnavailableNoticeProps = {
  reason: string;
  similar: readonly { asset: Asset; price: ListPriceResult }[];
  locale: Locale;
  t: Translate;
};

export function UnavailableNotice({ reason, similar, locale, t }: UnavailableNoticeProps) {
  return (
    <section
      aria-labelledby="unavailable-title"
      className="panel grid overflow-hidden lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]"
    >
      <div className="flex gap-4 p-6 sm:p-8">
        <span
          aria-hidden="true"
          className="grid size-11 shrink-0 place-items-center rounded-full bg-warn-bg text-warn-fg ring-1 ring-warn-line"
        >
          <PauseIcon />
        </span>
        <div>
          <h2
            id="unavailable-title"
            className="font-display text-lg leading-snug font-bold tracking-tight uppercase"
          >
            {t('lease.unavailable.title')}
          </h2>
          <p className="mt-2 text-muted">{reason}</p>
          <Link
            href={`/${locale}`}
            className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold underline underline-offset-4 hover:text-accent-text"
          >
            {t('lease.unavailable.browse')} <span aria-hidden="true">→</span>
          </Link>
        </div>
      </div>

      {similar.length > 0 ? (
        <div className="border-t border-line bg-surface-2/50 p-6 sm:p-8 lg:border-t-0 lg:border-l">
          <h3 className="eyebrow">{t('lease.unavailable.similar')}</h3>
          <ul className="mt-4 grid gap-3 sm:grid-cols-3">
            {similar.map(({ asset, price }) => (
              <li key={asset.id}>
                <Link
                  href={`/${locale}/assets/${asset.id}`}
                  className="group flex h-full items-center gap-3 rounded-lg border border-line bg-surface p-2 transition hover:-translate-y-0.5 hover:border-accent sm:flex-col sm:items-stretch"
                >
                  <CategoryArt
                    asset={asset}
                    className="aspect-square w-16 shrink-0 rounded-md sm:aspect-[4/3] sm:w-full"
                  />
                  <span className="flex min-w-0 flex-col px-1 pb-1">
                    <span className="eyebrow truncate">{asset.make}</span>
                    <span className="truncate font-display text-sm font-bold tracking-tight group-hover:text-accent-text">
                      {asset.model}
                    </span>
                    <span className="mt-1 text-xs text-muted tabular-nums">
                      {asset.model_year}
                      {price.ok ? ` · ${formatEuro(price.priceCents, intlLocale[locale])}` : ''}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

function PauseIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth={2}>
      <circle cx="12" cy="12" r="9" />
      <path d="M10 9v6M14 9v6" strokeLinecap="round" />
    </svg>
  );
}
