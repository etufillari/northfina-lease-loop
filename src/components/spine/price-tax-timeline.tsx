import type { RentalVatPeriod } from '@/domain/price-explanation';
import { formatEuro } from '@/domain/money';
import { formatIsoDate, formatNumber } from '@/i18n/format';
import { getT } from '@/i18n/get-t';
import { intlLocale, type Locale } from '@/i18n/locales';

export function PriceTaxTimeline({
  periods,
  locale,
}: {
  periods: readonly RentalVatPeriod[];
  locale: Locale;
}) {
  const t = getT(locale);
  return (
    <div className="space-y-4">
      <h4 className="font-semibold">{t('explain.timelineTitle')}</h4>
      <p className="ui-note">{t('spine.taxHelp')}</p>
      <ol className="price-timeline">
        {periods.map((period) => (
          <li key={period.firstDate}>
            <p className="font-semibold tabular-nums">
              {t('explain.monthlyAmount', {
                amount: formatEuro(period.grossCents, intlLocale[locale]),
              })}
            </p>
            <p className="ui-note">
              {t('explain.vatPeriod', {
                count: formatNumber(period.count, locale),
                first: formatIsoDate(period.firstDate, locale),
                last: formatIsoDate(period.lastDate, locale),
              })}
            </p>
            <p className="ui-note">
              {t('explain.vatRate', { rate: formatNumber(period.vatBasisPoints / 100, locale) })}
            </p>
            <p className="ui-note">
              {t('explain.vatAmount', { amount: formatEuro(period.vatCents, intlLocale[locale]) })}
            </p>
          </li>
        ))}
      </ol>
    </div>
  );
}
