import type { PriceExplanation as PriceExplanationModel } from '@/domain/price-explanation';
import { formatEuro } from '@/domain/money';
import { formatIsoDate, formatNumber } from '@/i18n/format';
import { getT, type MessageKey } from '@/i18n/get-t';
import { intlLocale, type Locale } from '@/i18n/locales';

export function priceSourceLabel(source: string, locale: Locale): string {
  const [kind, version] = source.split(':');
  return getT(locale)(kind === 'release' ? 'spine.releasePrice' : 'asset.priceListVersion', {
    version: version ?? '',
  });
}

type Props = {
  explanation: PriceExplanationModel;
  locale: Locale;
  pricedOn: string;
  priceSource: string;
};

export function PriceCalculation({ explanation, locale, pricedOn, priceSource }: Props) {
  const t = getT(locale);
  const money = (cents: number) => formatEuro(cents, intlLocale[locale]);
  const { terms, buyout } = explanation;
  const factor = new Intl.NumberFormat(intlLocale[locale], {
    maximumFractionDigits: 6,
  }).format(terms.factorMillionths / 1_000_000);
  const priceRows: [MessageKey, number][] = [
    ['spine.list', terms.listPriceCents],
    ['spine.down', terms.downPaymentCents],
    ['spine.financed', terms.financedCents],
  ];
  const totalRows: [MessageKey, number][] = [
    ['spine.rentTotal', explanation.rentNetCents],
    ['spine.buyout', buyout.netCents],
    ['spine.useTotal', explanation.useNetCents],
    ['spine.ownTotal', explanation.ownNetCents],
  ];

  return (
    <div className="price-calculation min-w-0 space-y-5">
      <div>
        <p className="ui-note mb-2">
          {t('explain.source', {
            source: priceSourceLabel(priceSource, locale),
            date: formatIsoDate(pricedOn, locale),
          })}
        </p>
        <dl className="divide-y divide-stone-200 dark:divide-stone-700">
          {priceRows.map(([key, cents]) => (
            <div key={key} className="price-row">
              <dt>{t(key)}</dt>
              <dd>{money(cents)}</dd>
            </div>
          ))}
        </dl>
        <p className="ui-note mt-2">{t('explain.financedHelp')}</p>
      </div>
      <details className="ui-disclosure">
        <summary>{t('spine.factor')}</summary>
        <div className="space-y-3">
          <p>
            {t('explain.financedFormula', {
              price: money(terms.listPriceCents),
              upfront: money(terms.downPaymentCents),
              financed: money(terms.financedCents),
            })}
          </p>
          <p className="font-semibold tabular-nums">
            {t('explain.factorFormula', {
              financed: money(terms.financedCents),
              factor,
              monthly: money(terms.monthlyNetCents),
            })}
          </p>
          <p className="ui-note">
            {t('explain.factorHelp', {
              band: terms.band,
              version: formatNumber(terms.coefficientTableVersion, locale),
            })}
          </p>
          <p className="ui-note">{t('explain.rounding')}</p>
          <p className="pt-2 font-semibold">{t('explain.netTotals')}</p>
          <dl>
            {totalRows.map(([key, cents]) => (
              <div key={key} className="price-row">
                <dt>{t(key)}</dt>
                <dd>{money(cents)}</dd>
              </div>
            ))}
          </dl>
        </div>
      </details>
    </div>
  );
}
