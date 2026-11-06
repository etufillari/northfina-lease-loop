import type { PriceExplanation as PriceExplanationModel } from '@/domain/price-explanation';
import { formatEuro } from '@/domain/money';
import { formatIsoDate, formatNumber } from '@/i18n/format';
import { getT } from '@/i18n/get-t';
import { intlLocale, type Locale } from '@/i18n/locales';
import { PriceCalculation } from './price-calculation';
import { PriceTaxTimeline } from './price-tax-timeline';

export { priceSourceLabel } from './price-calculation';

type Props = {
  explanation: PriceExplanationModel;
  locale: Locale;
  pricedOn: string;
  priceSource: string;
  upfrontDate: string;
  showCalculation?: boolean;
};

export function PriceExplanation({
  explanation,
  locale,
  pricedOn,
  priceSource,
  upfrontDate,
  showCalculation = true,
}: Props) {
  const t = getT(locale);
  const money = (cents: number) => formatEuro(cents, intlLocale[locale]);
  const { terms, firstRent, upfront, buyout } = explanation;

  return (
    <div className="price-summary space-y-6">
      <div>
        <h3 className="mb-4 text-xl font-semibold">{t('explain.title')}</h3>
        <div className="price-headline">
          <p className="font-medium">{t('explain.firstPayment')}</p>
          <p className="price-number">{money(firstRent.grossCents)}</p>
          <p className="ui-note">
            {t('explain.onDate', { date: formatIsoDate(firstRent.invoiceDate, locale) })}
          </p>
          <p className="mt-3">{t('explain.fixedNet', { amount: money(terms.monthlyNetCents) })}</p>
        </div>
        <p className="ui-note mt-3">
          {t('explain.rentTerm', {
            count: formatNumber(terms.termMonths, locale),
            date: formatIsoDate(explanation.endDate, locale),
          })}
        </p>
      </div>

      <div>
        <dl>
          <AmountRow label={t('explain.upfrontGross')} amount={money(upfront.grossCents)} />
        </dl>
        <p className="ui-note">
          {t('explain.upfrontTiming', { date: formatIsoDate(upfrontDate, locale) })}
        </p>
        <p className="ui-note mt-2">{t('explain.firstMonthHelp')}</p>
      </div>

      <div className="price-outcome-grid">
        <div className="price-total">
          <dl>
            <AmountRow
              label={t('spine.forecastUseGross')}
              amount={money(explanation.useGrossCents)}
            />
          </dl>
          <p className="ui-note">
            {t('explain.useEquation', {
              upfront: money(upfront.grossCents),
              months: formatNumber(terms.termMonths, locale),
              rent: money(explanation.rentGrossCents),
            })}
          </p>
        </div>
        <div className="price-total">
          <dl>
            <AmountRow label={t('explain.buyoutGross')} amount={money(buyout.grossCents)} />
          </dl>
          <p className="ui-note">
            {t('explain.buyoutTiming', { date: formatIsoDate(explanation.endDate, locale) })}
          </p>
          <dl className="mt-3">
            <AmountRow
              label={t('spine.forecastOwnGross')}
              amount={money(explanation.ownGrossCents)}
            />
          </dl>
          <p className="ui-note">
            {t('explain.ownEquation', {
              use: money(explanation.useGrossCents),
              buyout: money(buyout.grossCents),
            })}
          </p>
        </div>
      </div>

      <div className="price-tax-surface">
        <PriceTaxTimeline periods={explanation.rentalPeriods} locale={locale} />
      </div>
      {showCalculation ? (
        <PriceCalculation
          explanation={explanation}
          locale={locale}
          pricedOn={pricedOn}
          priceSource={priceSource}
        />
      ) : null}
      <p className="ui-note">
        {t('explain.assumptions', {
          upfront: formatIsoDate(upfrontDate, locale),
          end: formatIsoDate(explanation.endDate, locale),
        })}
      </p>
    </div>
  );
}

function AmountRow({ label, amount }: { label: string; amount: string }) {
  return (
    <div className="price-row">
      <dt>{label}</dt>
      <dd>{amount}</dd>
    </div>
  );
}
