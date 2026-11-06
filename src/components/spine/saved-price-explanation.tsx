import type { QuoteView } from '@/server/spine-views';
import { explainPrice } from '@/domain/price-explanation';
import { formatIsoDate } from '@/i18n/format';
import { getT } from '@/i18n/get-t';
import type { Locale } from '@/i18n/locales';
import { PriceExplanation } from './price-explanation';
import { priceFailureMessage } from './price-feedback';
import type { Bootstrap } from './price-panel';

/** Preserve saved prices; only the tax forecast follows the assumed invoice date. */
export function SavedPriceExplanation({
  quote,
  data,
  locale,
}: {
  quote: QuoteView;
  data: Bootstrap;
  locale: Locale;
}) {
  const t = getT(locale);
  const result = explainPrice({
    terms: quote.terms,
    startDate: quote.startDate,
    upfrontDate: data.businessDate,
    vatRates: data.vatRates,
  });
  return (
    <div className="mt-4 space-y-4">
      <p className="text-sm">
        {t('explain.savedBasis', { date: formatIsoDate(quote.pricedOn, locale) })}
      </p>
      {data.businessDate > quote.validThrough ? (
        <p role="status" className="font-medium">
          {t('spine.error.QUOTE_EXPIRED')}
        </p>
      ) : null}
      {result.ok ? (
        <PriceExplanation
          explanation={result.explanation}
          pricedOn={quote.pricedOn}
          priceSource={quote.priceSource}
          upfrontDate={data.businessDate}
          locale={locale}
        />
      ) : (
        <p role="status">{priceFailureMessage(result.reason, data, locale)}</p>
      )}
    </div>
  );
}
