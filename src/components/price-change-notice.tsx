// Card 2: the price changed between the quote and signing. Shows both prices and why, and asks
// the customer to accept today's price before signing (the checkbox is required in the form).
import { formatEuro } from '@/domain/money';
import type { PriceChange } from '@/domain/price-lock';
import { getT } from '@/i18n/get-t';
import { intlLocale, type Locale } from '@/i18n/locales';

export function PriceChangeNotice({
  locale,
  changes,
  quotedOn,
}: {
  locale: Locale;
  changes: readonly PriceChange[];
  /** The formatted quote date. */
  quotedOn: string;
}) {
  const t = getT(locale);
  const money = (cents: number) => formatEuro(cents, intlLocale[locale]);
  return (
    <section
      aria-labelledby="price-change"
      className="rounded-lg border border-amber-200 bg-amber-50 p-5 text-ink"
    >
      <h3 id="price-change" className="text-body font-semibold">
        {t('priceLock.title')}
      </h3>
      <p className="mt-2 text-caption">{t('priceLock.body', { date: quotedOn })}</p>
      <ul className="mt-4 space-y-3 text-caption">
        {changes.map((change) => (
          <li key={change.id}>
            <p className="font-semibold">{change.name}</p>
            <p>
              {t('priceLock.item', {
                quoted: money(change.quotedPriceCents),
                quotedVersion: change.quotedPriceListVersion,
                price: money(change.priceCents),
                version: change.priceListVersion,
              })}
            </p>
            <p>
              {t('priceLock.monthly', {
                quoted: money(change.quotedMonthlyTotalCents),
                monthly: money(change.monthlyTotalCents),
              })}{' '}
              {change.differenceCents < 0
                ? t('priceLock.lower', { amount: money(-change.differenceCents) })
                : t('priceLock.higher', { amount: money(change.differenceCents) })}
            </p>
          </li>
        ))}
      </ul>
      <label className="mt-4 flex items-start gap-3 text-caption">
        <input type="checkbox" name="acceptPriceChange" required className="mt-0.5 size-5" />
        <span>{t('priceLock.accept')}</span>
      </label>
    </section>
  );
}
