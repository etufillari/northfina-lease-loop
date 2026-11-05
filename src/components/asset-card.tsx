// One catalogue item. A server component: it renders to HTML and ships no JavaScript.
import type { Asset, AssetStatus, CoefficientTable, VatRates } from '@/data/schemas';
import { formatEuro } from '@/domain/money';
import type { ListPriceResult } from '@/domain/price-list';
import { formatNumber } from '@/i18n/format';
import type { Translate } from '@/i18n/get-t';
import { intlLocale, type Locale } from '@/i18n/locales';
import { ContractDrawerTrigger } from './contract';

// Available = green check, reserved = amber hourglass, returned = blue check.
const statusColors: Record<AssetStatus, string> = {
  available: 'text-emerald-600 dark:text-emerald-400',
  reserved: 'text-amber-600 dark:text-amber-400',
  returned: 'text-sky-600 dark:text-sky-400',
};

function StatusIcon({ status }: { status: AssetStatus }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="size-6"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {status === 'reserved' ? (
        <>
          <path d="M6 3h12M6 21h12" />
          <path d="M7 3v3.5a5 5 0 0 0 2 4l3 1.5-3 1.5a5 5 0 0 0-2 4V21" />
          <path d="M17 3v3.5a5 5 0 0 1-2 4L12 12l3 1.5a5 5 0 0 1 2 4V21" />
        </>
      ) : (
        <path d="M4 12.5 9.5 18 20 6.5" />
      )}
    </svg>
  );
}

/** An icon with the status text as a tooltip (hover or keyboard focus) and for screen readers. */
function StatusBadge({ status, t }: { status: AssetStatus; t: Translate }) {
  return (
    <span
      tabIndex={0}
      className={`group/status relative shrink-0 rounded-full p-0.5 ${statusColors[status]}`}
    >
      <StatusIcon status={status} />
      <span className="sr-only">
        {t('status.label')}: {t(`status.${status}`)}
      </span>
      <span
        aria-hidden="true"
        className="pointer-events-none absolute top-full right-0 z-10 mt-1 hidden rounded-md bg-stone-900 px-2 py-1 text-xs font-medium whitespace-nowrap text-white shadow group-hover/status:block group-focus/status:block dark:bg-stone-100 dark:text-stone-900"
      >
        {t(`status.${status}`)}
      </span>
    </span>
  );
}

type AssetCardProps = {
  asset: Asset;
  price: ListPriceResult;
  locale: Locale;
  t: Translate;
  coefficientTable?: CoefficientTable;
  vatRates?: VatRates;
  isoDate?: string;
};

export function AssetCard({
  asset,
  price,
  locale,
  t,
  coefficientTable,
  vatRates,
  isoDate,
}: AssetCardProps) {
  const headingId = `asset-${asset.id}`;

  return (
    <article
      aria-labelledby={headingId}
      className="flex h-full flex-col rounded-2xl border border-stone-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md dark:border-stone-800 dark:bg-stone-900"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm text-stone-600 dark:text-stone-400">{asset.make}</p>
          <h3 id={headingId} className="text-lg leading-snug font-semibold">
            {asset.model}
          </h3>
        </div>
        <StatusBadge status={asset.status} t={t} />
      </div>

      <dl className="mt-4 mb-5 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
        <Fact label={t('condition.label')} value={t(`condition.${asset.condition}`)} />
        <Fact label={t('asset.modelYear')} value={String(asset.model_year)} />
        <Fact
          label={t('asset.usage')}
          value={t(`usage.${asset.usage.unit}`, { value: formatNumber(asset.usage.value, locale) })}
        />
        <Fact label={t('asset.previousLives')} value={formatNumber(asset.previous_lives, locale)} />
      </dl>

      <div className="mt-auto flex items-end justify-between gap-3 border-t border-stone-100 pt-4 dark:border-stone-800">
        <div className="text-xs text-stone-600 dark:text-stone-400">
          <p>{t('asset.listPrice')}</p>
          {price.ok ? (
            <p>{t('asset.priceListVersion', { version: price.priceListVersion })}</p>
          ) : null}
        </div>
        <p className="text-right text-xl font-semibold tabular-nums">
          {price.ok ? formatEuro(price.priceCents, intlLocale[locale]) : t('asset.noPrice')}
        </p>
      </div>

      {coefficientTable && vatRates && isoDate ? (
        <ContractDrawerTrigger
          asset={asset}
          price={price}
          coefficientTable={coefficientTable}
          vatRates={vatRates}
          isoDate={isoDate}
          locale={locale}
        />
      ) : null}
    </article>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-stone-600 dark:text-stone-400">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}
