// "Choose a version": the versions of one model a customer can lease (new, or used with its
// life, wear and year), each with its monthly price at the catalogue's term, as links to their
// own pages. The page being shown is marked current. A server component, no JavaScript: picking
// a version opens that unit's page, where its own price is worked out.
import Link from 'next/link';
import type { ModelVersion } from '@/domain/catalogue/catalogue';
import { formatEuro } from '@/domain/money';
import { formatNumber } from '@/i18n/format';
import type { Translate } from '@/i18n/get-t';
import { intlLocale, type Locale } from '@/i18n/locales';
import { cx } from './ui';

type VersionPickerProps = {
  versions: ModelVersion[];
  currentId: string;
  locale: Locale;
  t: Translate;
};

export function VersionPicker({ versions, currentId, locale, t }: VersionPickerProps) {
  return (
    <section aria-labelledby="versions-title" className="mt-6">
      <h2 id="versions-title" className="text-lg">
        {t('asset.versions.title')}
      </h2>
      <ul className="mt-3 grid gap-2 sm:grid-cols-2">
        {versions.map((version) => {
          const { asset } = version;
          const current = version.assetIds.includes(currentId);
          return (
            <li key={version.key}>
              <Link
                href={`/${locale}/assets/${current ? currentId : asset.id}`}
                aria-current={current ? 'page' : undefined}
                className={cx(
                  'flex h-full flex-col rounded-lg border-2 px-4 py-3 transition-colors',
                  current
                    ? 'border-brand bg-brand-soft'
                    : 'border-line bg-raised hover:border-brand'
                )}
              >
                <span className="flex flex-wrap items-baseline justify-between gap-x-3">
                  <span className="font-heading text-lg font-semibold whitespace-nowrap">
                    {asset.previous_lives === 0
                      ? t('asset.versions.new')
                      : t('asset.versions.used', { n: asset.previous_lives + 1 })}
                  </span>
                  <span className="font-bold whitespace-nowrap text-brand-text tabular-nums">
                    {version.monthlyCents === null
                      ? t('asset.versions.seeDetails')
                      : t('asset.versions.perMonth', {
                          amount: formatEuro(version.monthlyCents, intlLocale[locale]),
                        })}
                  </span>
                </span>
                <span className="mt-1 text-sm text-ink-muted">
                  {[
                    t(`condition.${asset.condition}`),
                    t(`usage.${asset.usage.unit}`, {
                      value: formatNumber(asset.usage.value, locale),
                    }),
                    String(asset.model_year),
                    ...(version.assetIds.length > 1
                      ? [
                          t('asset.versions.inStock', {
                            count: formatNumber(version.assetIds.length, locale),
                          }),
                        ]
                      : []),
                  ].join(' · ')}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
