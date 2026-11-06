import type { Asset } from '@/data/schemas';
import type { ItemChange } from '@/domain/item-changes';
import { formatIsoDate, formatNumber } from '@/i18n/format';
import { getT, type MessageKey } from '@/i18n/get-t';
import type { Locale } from '@/i18n/locales';
import type { PublishedRefurbishment } from '@/server/relisting';

const factRow =
  'flex min-w-0 flex-wrap justify-between gap-x-6 gap-y-2 border-b border-hairline py-4 text-caption';

/** One row of the refurbishment list: what was touched, and what happened to it. */
function changeRow(
  locale: Locale,
  change: ItemChange
): [key: string, label: string, value: string] {
  const t = getT(locale);
  switch (change.kind) {
    case 'part':
      return [
        change.checkId,
        t(`inspection.check.${change.checkId}` as MessageKey),
        t(`product.change.${change.action}`),
      ];
    case 'damage':
      return [
        `${change.area}-${change.type}`,
        `${change.area} · ${t(`inspection.damage.${change.type}` as MessageKey)}`,
        t('product.change.repaired'),
      ];
    case 'condition':
      return [
        'condition',
        t('condition.label'),
        `${t(`condition.${change.from}`)} → ${t(`condition.${change.to}`)}`,
      ];
    case 'task':
      return [change.id, t(`recovery.task.${change.id}` as MessageKey), t('product.change.done')];
  }
}

export function ProductDetails({
  asset,
  locale,
  refurbishment,
}: {
  asset: Asset;
  locale: Locale;
  refurbishment: PublishedRefurbishment | null;
}) {
  const t = getT(locale);
  const battery = asset.category === 'laptop' ? refurbishment?.battery : null;
  const highlights = [
    [t('condition.label'), t(`condition.${asset.condition}`)],
    battery
      ? [
          t('inspection.reading.battery_health'),
          battery.kind === 'new'
            ? t('product.batteryNew')
            : `${formatNumber(battery.percent, locale)} %`,
        ]
      : [
          t(`product.usage.${asset.category}`),
          t(`usage.${asset.usage.unit}`, { value: formatNumber(asset.usage.value, locale) }),
        ],
    [t('asset.previousLives'), formatNumber(asset.previous_lives, locale)],
  ];
  const facts = [
    [t('product.make'), asset.make],
    [t('product.model'), asset.model],
    [t('asset.modelYear'), String(asset.model_year)],
    [t('product.serialNumber'), asset.serial_number],
  ];

  return (
    <div className="mx-auto max-w-[1200px] px-4 pb-section-compact sm:px-6 tablet:pb-section">
      <section
        aria-labelledby="product-details"
        className="border-t border-hairline pt-10 tablet:pt-12"
      >
        <div className="grid gap-6 tablet:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] tablet:gap-12">
          <div>
            <p className="text-caption font-semibold text-primary">
              {t(`category.${asset.category}`)}
            </p>
            <h2
              id="product-details"
              className="mt-3 max-w-sm font-display text-display-sm font-semibold"
            >
              {t('product.details')}
            </h2>
            <p className="mt-4 max-w-lg text-body text-ink-muted">
              {t(`product.description.${asset.category}`)}
            </p>
          </div>
          <dl className="grid grid-cols-1 gap-5 rounded-lg bg-parchment p-6 min-[30rem]:grid-cols-3 tablet:p-8">
            {highlights.map(([label, value]) => (
              <div key={label} className="min-w-0">
                <dt className="text-caption text-ink-muted">{label}</dt>
                <dd className="mt-2 text-tagline font-semibold wrap-anywhere">{value}</dd>
              </div>
            ))}
          </dl>
        </div>
        <dl className="mt-8 grid gap-x-10 tablet:grid-cols-2">
          {facts.map(([label, value]) => (
            <div key={label} className={factRow}>
              <dt className="text-ink-muted">{label}</dt>
              <dd className="font-semibold wrap-anywhere">{value}</dd>
            </div>
          ))}
        </dl>
        {refurbishment?.changes.length ? (
          <>
            <h3 className="mt-10 text-tagline font-semibold">{t('recovery.history')}</h3>
            <p className="mt-2 text-caption text-ink-muted">
              {t('recovery.historyIntro', { date: formatIsoDate(refurbishment.date, locale) })}
            </p>
            <dl className="mt-4 grid gap-x-10 tablet:grid-cols-2">
              {refurbishment.changes.map((change) => {
                const [key, label, value] = changeRow(locale, change);
                return (
                  <div key={key} className={factRow}>
                    <dt className="text-ink-muted">{label}</dt>
                    <dd className="font-semibold wrap-anywhere">{value}</dd>
                  </div>
                );
              })}
            </dl>
          </>
        ) : null}
      </section>

      <section
        aria-labelledby="product-next-life"
        className="mt-12 rounded-lg bg-parchment p-6 tablet:mt-16 tablet:p-8"
      >
        <h2 id="product-next-life" className="font-display text-display-sm font-semibold">
          {t('product.endTitle')}
        </h2>
        <p className="mt-3 max-w-2xl text-body text-ink-muted">{t('product.endIntro')}</p>
        <div className="mt-8 grid gap-6 tablet:grid-cols-3">
          {(['buy', 'return', 'pass'] as const).map((option) => (
            <div key={option} className="border-t border-hairline pt-5">
              <LifeIcon option={option} />
              <h3 className="mt-4 text-body font-semibold">{t(`product.end.${option}.title`)}</h3>
              <p className="mt-2 text-caption text-ink-muted">{t(`product.end.${option}.body`)}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function LifeIcon({ option }: { option: 'buy' | 'return' | 'pass' }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-6 text-primary"
    >
      {option === 'buy' ? (
        <>
          <path d="M5 8h14l1 13H4L5 8Z" />
          <path d="M8 8V6a4 4 0 0 1 8 0v2M9 14l2 2 4-4" />
        </>
      ) : option === 'return' ? (
        <>
          <path d="M8 7H4V3" />
          <path d="M4 7a8 8 0 1 1-1 8M9 12h6" />
        </>
      ) : (
        <>
          <path d="M4 8h15m-4-4 4 4-4 4M20 16H5m4-4-4 4 4 4" />
        </>
      )}
    </svg>
  );
}
